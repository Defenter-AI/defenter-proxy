import { dirname, join } from "path";
import { homedir } from "os";
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeHooks } from "@defenter/common-ts/hooks/initialize";
import { ConsoleErrorHandler } from "@defenter/common-ts/console";
import {
    buildClaudeCodeHooksInitInput,
    getClaudeProjectSettingsPaths,
    getClaudeManagedSettingsPath,
    getClaudeUserSettingsPath,
    fileExists,
} from "@defenter/common-ts/utils";
import { ClaudeCodeConfigDiscoverer } from "./configDiscoverer";
import { ClaudeCodeUvRunner } from "./uvRunner";
import { ClaudeCodeLogger } from "./logger";
import { isDaemonRunning } from "./session-start";
import { getClaudeDaemonPidPath, getClaudePluginRoot, type ClaudeDaemonScope } from "./paths";

const writePidFile = (pidPath: string) =>
    writeFileSync(pidPath, process.pid.toString(), {
        encoding: "utf8",
        flag: "wx",
    });

const deletePidFile = (pidPath: string) => unlinkSync(pidPath);

export interface RunDaemonOptions {
    scope: ClaudeDaemonScope;
    root?: string;
    stdin?: Buffer;
}

export function parseRunDaemonOptions(argv: string[]): RunDaemonOptions {
    let scope: ClaudeDaemonScope = "user";
    let root: string | undefined;

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--scope") {
            const v = argv[i + 1];
            if (v === "project" || v === "user" || v === "managed") {
                scope = v;
            }
            i++;
            continue;
        }
        if (a === "--root") {
            root = argv[i + 1];
            i++;
        }
    }

    return { scope, root };
}

export async function runDaemonScoped(opts: RunDaemonOptions): Promise<never> {
    const logger = new ClaudeCodeLogger();
    logger.info(`Starting daemon (scope=${opts.scope})...`);

    if (isDaemonRunning(opts.scope, opts.root)) {
        logger.info("Daemon already running");
        process.exit(0);
    }

    const pidPath = getClaudeDaemonPidPath(opts.scope, opts.root);
    mkdirSync(dirname(pidPath), { recursive: true });
    try {
        writePidFile(pidPath);
    } catch (error: any) {
        if (error?.code === "EEXIST") {
            if (isDaemonRunning(opts.scope, opts.root)) {
                logger.info("Daemon already running");
                process.exit(0);
            }
            try {
                deletePidFile(pidPath);
            } catch {}
            writePidFile(pidPath);
        } else {
            throw error;
        }
    }

    const cleanup = () => {
        try {
            deletePidFile(pidPath);
        } catch {}
        process.exit(0);
    };
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);

    const errorHandler = new ConsoleErrorHandler();
    const uvRunner = new ClaudeCodeUvRunner();
    const discoverer = new ClaudeCodeConfigDiscoverer(opts.scope, opts.root);

    await uvRunner.initialize();
    const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude-code");
    await configMonitor.startMonitoring(uvRunner, discoverer);

    const rootsForInit =
        opts.scope === "project" ? (opts.root ? [opts.root] : []) : [homedir()];
    const initInput = buildClaudeCodeHooksInitInput({
        workspaceRoots: rootsForInit,
        stdin: opts.stdin,
        cwdOverride: opts.root,
    });
    await initializeHooks(uvRunner, initInput, logger, "claude-code");

    const hooksJsonPath = join(getClaudePluginRoot(), "hooks", "hooks.json");
    const hooksMonitor = new ClaudeCodeHooksMonitor(hooksJsonPath, errorHandler, logger);

    const settingsFiles: string[] = [];
    if (opts.scope === "user") {
        settingsFiles.push(getClaudeUserSettingsPath());
    } else if (opts.scope === "managed") {
        const globalSettings = getClaudeManagedSettingsPath();
        if (globalSettings) {
            settingsFiles.push(globalSettings);
        }
    } else if (opts.scope === "project" && opts.root) {
        settingsFiles.push(...getClaudeProjectSettingsPaths(opts.root));
    }

    if (!settingsFiles.length) {
        logger.info(`No settings paths for scope=${opts.scope}`);
    } else if (opts.scope === "managed") {
        const existing = (
            await Promise.all(settingsFiles.map(async p => ((await fileExists(p)) ? p : undefined)))
        ).filter((p): p is string => Boolean(p));
        if (existing.length) {
            await hooksMonitor.startMonitoring(existing);
        } else {
            logger.info("Managed settings file not found; skipping hooks registration");
        }
    } else {
        await hooksMonitor.startMonitoring(settingsFiles);
    }

    logger.info("Daemon running");
    return await new Promise<never>(() => {});
}
