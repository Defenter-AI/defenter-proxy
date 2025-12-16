#!/usr/bin/env node
import { join, dirname } from "path";
import { homedir } from "os";
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeHooks } from "@defenter/common-ts/hooks/initialize";
import {
    getClaudeGlobalSettingsPath,
    getClaudeUserSettingsPath,
    parseClaudeProjects,
} from "@defenter/common-ts/utils";
import { ClaudeCodeConfigDiscoverer } from "./configDiscoverer";
import { ClaudeCodeUvRunner } from "./uvRunner";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeErrorHandler } from "./errorHandler";
import { isDaemonRunning, sessionStart } from "./session-start";

async function main() {
    const command = process.argv[2];

    switch (command) {
        case "session-start": {
            await sessionStart();
            break;
        }
        case "hook": {
            // ensure uvx and daemon
            if (!isDaemonRunning()) {
                await sessionStart();
            }

            // Execute defenter-proxy, passing through stdin/stdout
            const proc = spawn("uvx", ["defenter-proxy", "--ide-tool", "--ide", "claude-code"], {
                stdio: "inherit",
            });
            proc.on("close", code => process.exit(code ?? 0));
            proc.on("error", err => {
                console.error("Failed to run uvx defenter-proxy:", err.message);
                process.exit(1);
            });
            break;
        }
        case "daemon": {
            console.log("Starting daemon...");

            // Write PID file for session-start to detect running daemon
            const pidPath = join(homedir(), ".defenter", ".wrapped_mcps", "claude", "daemon.pid");
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");

            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            process.on("SIGINT", cleanup);

            const logger = new ClaudeCodeLogger();
            const errorHandler = new ClaudeCodeErrorHandler();
            const uvRunner = new ClaudeCodeUvRunner();
            const discoverer = new ClaudeCodeConfigDiscoverer();

            await uvRunner.initialize();
            const configMonitor = new ConfigurationMonitor(
                errorHandler,
                logger,
                "claude"
            );
            await configMonitor.startMonitoring(uvRunner, discoverer);

            // Initialize hooks with backend
            const workspaceRoots = await parseClaudeProjects(homedir());
            await initializeHooks(uvRunner, workspaceRoots, logger, "claude-code");

            // Start hooks monitoring to re-register hooks when settings.json changes
            const hooksJsonPath = join(
                process.env.CLAUDE_PLUGIN_ROOT!,
                "hooks",
                "hooks.json"
            );
            const hooksMonitor = new ClaudeCodeHooksMonitor(
                hooksJsonPath,
                errorHandler,
                logger
            );

            const settingsFiles = [getClaudeUserSettingsPath()];
            const globalSettings = getClaudeGlobalSettingsPath();
            if (globalSettings) {
                settingsFiles.push(globalSettings);
            }
            await hooksMonitor.startMonitoring(settingsFiles);

            console.log("Daemon running");
            await new Promise(() => {});
            break;
        }
        default: {
            console.error(`Unknown command: ${command}`);
            console.error("Usage: launcher.js <session-start|hook|daemon>");
            process.exit(1);
            break;
        }
    }
}

main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
});
