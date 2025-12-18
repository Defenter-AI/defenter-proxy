import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { reportLifecycleEvent } from "./api";
import { ClaudeCodeLogger } from "./logger";
import {
    getClaudeDaemonPidPath,
    getClaudeDaemonsDir,
    getClaudeDefenterDir,
    getClaudePluginRoot,
    getClaudeVersionFilePath,
    type ClaudeDaemonScope,
} from "./paths";
import { VERSION } from "./version";

export function ensureDaemonRunning(
    scope: ClaudeDaemonScope,
    root: string | undefined,
    stdin?: Buffer
): void {
    if (!isDaemonRunning(scope, root)) {
        startDaemon(scope, root, stdin);
    }
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

export function isDaemonRunning(scope: ClaudeDaemonScope, root?: string): boolean {
    const pidPath = getClaudeDaemonPidPath(scope, root);
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

export function startDaemon(
    scope: ClaudeDaemonScope,
    root?: string,
    stdin?: Buffer
): void {
    const logger = new ClaudeCodeLogger();
    const pluginRoot = getClaudePluginRoot();

    const daemonsDir = getClaudeDaemonsDir();
    if (!existsSync(daemonsDir)) {
        mkdirSync(daemonsDir, { recursive: true });
    }

    const args = ["daemon", "--scope", scope];
    if (scope === "project" && root) {
        args.push("--root", root);
    }

    const daemon = spawn("node", [join(pluginRoot, "dist", "launcher.js"), ...args], {
        detached: true,
        stdio: ["pipe", "ignore", "ignore"],
        env: process.env,
        shell: false,
    });
    daemon.stdin?.end(stdin ?? Buffer.alloc(0));
    daemon.unref();
    logger.info(`Daemon started (scope=${scope})`);
}

export async function sessionStart(stdin?: Buffer): Promise<void> {
    const logger = new ClaudeCodeLogger();
    logger.info("Defenter SessionStart");

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

    // Start global daemons (project daemons are started on-demand from hooks)
    ensureDaemonRunning("user", undefined, stdin);
    ensureDaemonRunning("managed", undefined, stdin);

    process.exit(0);
}
