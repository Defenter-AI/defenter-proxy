import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { reportLifecycleEvent } from "./api";
import { VERSION } from "./version";

async function checkUvxInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn("uvx", ["--version"], { stdio: "pipe" });
        proc.on("error", () => resolve(false));
        proc.on("close", (code) => resolve(code === 0));
    });
}

function getVersionFilePath(): string {
    return join(homedir(), ".defenter", ".claude-code-version");
}

function getStoredVersion(): string | undefined {
    try {
        return readFileSync(getVersionFilePath(), "utf8").trim();
    } catch {
        return undefined;
    }
}

function saveVersion(version: string): void {
    const filePath = getVersionFilePath();
    const dir = join(homedir(), ".defenter");
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, version, "utf8");
}

function getDaemonPidPath(): string {
    return join(homedir(), ".defenter", ".wrapped_mcps", "claude", "daemon.pid");
}

function isDaemonRunning(): boolean {
    const pidPath = getDaemonPidPath();
    if (!existsSync(pidPath)) {
        return false;
    }

    try {
        const pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
        if (isNaN(pid)) {
            return false;
        }

        // Check if process is running (signal 0 doesn't kill, just checks)
        process.kill(pid, 0);
        return true;
    } catch {
        // Process not running or no permission - clean up stale PID file
        try {
            unlinkSync(pidPath);
        } catch {}
        return false;
    }
}

function startDaemon(): void {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) {
        console.error("CLAUDE_PLUGIN_ROOT not set");
        return;
    }

    const daemon = spawn("node", [join(pluginRoot, "dist", "launcher.js"), "daemon"], {
        detached: true,
        stdio: "ignore",
    });
    daemon.unref();
    console.log("Daemon started");
}

export async function sessionStart(): Promise<void> {
    console.log("Defenter SessionStart");

    const hasUvx = await checkUvxInstalled();
    if (!hasUvx) {
        console.error("uvx not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh");
        process.exit(0);
    }

    // Lifecycle event reporting
    try {
        const storedVersion = getStoredVersion();
        if (!storedVersion) {
            await reportLifecycleEvent("install");
        } else if (storedVersion !== VERSION) {
            await reportLifecycleEvent("update");
        } else {
            await reportLifecycleEvent("heartbeat");
        }
        saveVersion(VERSION);
    } catch {
        // never crash on lifecycle reporting
    }

    if (isDaemonRunning()) {
        console.log("Daemon already running");
    } else {
        startDaemon();
    }

    process.exit(0);
}
