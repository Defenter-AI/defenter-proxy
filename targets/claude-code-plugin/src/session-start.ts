import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { reportLifecycleEvent } from "./api";
import { VERSION } from "./version";
import {
    getClaudeDaemonPidPath,
    getClaudeDefenterDir,
    getClaudeVersionFilePath,
} from "./paths";
import { ClaudeCodeLogger } from "./logger";
import { ensureUvxReady } from "./uvx";

export async function checkUvxInstalled(): Promise<boolean> {
    return new Promise(resolve => {
        const proc = spawn("uvx", ["--version"], { stdio: "pipe" });
        proc.on("error", () => resolve(false));
        proc.on("close", code => resolve(code === 0));
    });
}

export function getStoredVersion(): string | undefined {
    try {
        return readFileSync(getClaudeVersionFilePath(), "utf8").trim();
    } catch {
        return undefined;
    }
}

export function saveVersion(version: string): void {
    const dir = getClaudeDefenterDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(getClaudeVersionFilePath(), version, "utf8");
}

export function isDaemonRunning(): boolean {
    const pidPath = getClaudeDaemonPidPath();
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

export function startDaemon(): void {
    const logger = new ClaudeCodeLogger();
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) {
        logger.error("CLAUDE_PLUGIN_ROOT not set");
        return;
    }

    const daemon = spawn("node", [join(pluginRoot, "dist", "launcher.js"), "daemon"], {
        detached: true,
        stdio: "ignore",
        env: process.env,
    });
    daemon.unref();
    logger.info("Daemon started");
}

export async function sessionStart(): Promise<void> {
    const logger = new ClaudeCodeLogger();
    logger.info("Defenter SessionStart");

    try {
        const uvxExecutable = await ensureUvxReady(logger, VERSION);
        process.env.DEFENTER_UVX_EXECUTABLE = uvxExecutable;
    } catch (error) {
        logger.error("uvx setup failed", error);
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
        logger.info("Daemon already running");
    } else {
        startDaemon();
    }

    process.exit(0);
}
