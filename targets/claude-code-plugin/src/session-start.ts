import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

async function checkUvxInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn("uvx", ["--version"], { stdio: "pipe" });
        proc.on("error", () => resolve(false));
        proc.on("close", (code) => resolve(code === 0));
    });
}

function getDaemonPidPath(): string {
    return join(homedir(), ".defenter", ".wrapped_mcps", "claude", "daemon.pid");
}

function isDaemonRunning(): boolean {
    return existsSync(getDaemonPidPath());
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

    if (isDaemonRunning()) {
        console.log("Daemon already running");
    } else {
        startDaemon();
    }

    process.exit(0);
}
