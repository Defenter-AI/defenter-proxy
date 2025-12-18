import { spawn } from "child_process";
import { chmod, stat } from "fs/promises";
import { homedir } from "os";
import { join, sep } from "path";
import { IUvRunner, ILogger, UvCommand } from "./types";
import { fileExists, mapOS } from "./utils";

const LOCAL_BIN_PATH = join(homedir(), ".local", "bin");

/**
 * Get UV command with local development path support.
 * If DEFENTER_LOCAL_PROXY_PATH is set, uses local proxy for development.
 */
export function getUvCommand(version: string, uvxExecutable = "uvx"): UvCommand {
    if (process.env.DEFENTER_LOCAL_PROXY_PATH) {
        return {
            executable: "uv",
            args: [
                "run",
                "--directory",
                process.env.DEFENTER_LOCAL_PROXY_PATH,
                "defenter-proxy",
            ],
        };
    }

    return {
        executable: uvxExecutable,
        args: [`defenter-proxy==${version}`],
    };
}

export class SimpleUvRunner implements IUvRunner {
    private readonly version: string;

    constructor(version: string) {
        this.version = version;
    }

    async initialize(): Promise<void> {
        // no-op
    }

    getCommand(): UvCommand {
        return getUvCommand(this.version);
    }
}

function addLocalBinToPath(): void {
    const current = process.env.PATH ?? "";
    const pathSep = mapOS() === "windows" ? ";" : ":";
    if (!current.split(pathSep).includes(LOCAL_BIN_PATH)) {
        process.env.PATH = `${LOCAL_BIN_PATH}${pathSep}${current}`;
    }
}

async function commandExists(command: string): Promise<boolean> {
    if (!command.includes(sep) && !command.includes("/")) {
        return new Promise(resolve => {
            const testCmd = mapOS() === "windows" ? "where" : "which";
            const proc = spawn(testCmd, [command], { stdio: "ignore" });
            proc.on("close", code => resolve(code === 0));
            proc.on("error", () => resolve(false));
        });
    }
    try {
        const stats = await stat(command);
        return stats.isFile();
    } catch {
        return false;
    }
}

async function findUvxBinary(): Promise<string | undefined> {
    const isWindows = mapOS() === "windows";
    const candidates = isWindows
        ? ["uvx.exe", "uvx", join(LOCAL_BIN_PATH, "uvx.exe")]
        : ["uvx", join(LOCAL_BIN_PATH, "uvx")];

    for (const candidate of candidates) {
        if (await commandExists(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

function getSetupScriptName(): string {
    const platform = mapOS();
    switch (platform) {
        case "macos":
            return "setup-uvx-macos.sh";
        case "linux":
            return "setup-uvx-linux.sh";
        case "windows":
            return "setup-uvx-windows.ps1";
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}

function spawnProcess(command: string, args: string[], logger: ILogger): Promise<number> {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: "pipe", shell: false });
        proc.stdout?.on("data", data => {
            const lines = data
                .toString()
                .split("\n")
                .filter((l: string) => l.trim());
            lines.forEach((line: string) => logger.debug(`[uvx-setup] ${line.trim()}`));
        });
        proc.stderr?.on("data", data => {
            const lines = data
                .toString()
                .split("\n")
                .filter((l: string) => l.trim());
            lines.forEach((line: string) => logger.debug(`[uvx-setup] ${line.trim()}`));
        });
        proc.on("close", code => resolve(code ?? 0));
        proc.on("error", err => reject(err));
    });
}

export interface EnsureUvxOptions {
    scriptsDir: string;
    version: string;
    logger: ILogger;
    cleanCache?: boolean;
}

export async function ensureUvxReady(opts: EnsureUvxOptions): Promise<string> {
    const { scriptsDir, version, logger, cleanCache } = opts;

    addLocalBinToPath();

    const existingUvx = await findUvxBinary();
    if (existingUvx) {
        return existingUvx;
    }

    const scriptName = getSetupScriptName();
    const scriptPath = join(scriptsDir, scriptName);

    if (!(await fileExists(scriptPath))) {
        throw new Error(`uvx setup script missing: ${scriptPath}`);
    }

    logger.info("Installing uvx");

    const platform = mapOS();
    let exitCode: number;

    if (platform === "windows") {
        const args = ["-ExecutionPolicy", "Bypass", "-File", scriptPath, version];
        if (cleanCache) {
            args.push("-CleanCache");
        }
        exitCode = await spawnProcess("powershell.exe", args, logger);
    } else {
        await chmod(scriptPath, 0o755);
        const args = [version];
        if (cleanCache) {
            args.push("--clean-cache");
        }
        exitCode = await spawnProcess(scriptPath, args, logger);
    }

    addLocalBinToPath();

    const uvxBinary = await findUvxBinary();
    if (!uvxBinary) {
        if (exitCode !== 0) {
            throw new Error("uvx setup failed");
        }
        throw new Error("uvx not available after setup");
    }

    return uvxBinary;
}
