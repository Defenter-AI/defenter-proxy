import { dirname, join } from "path";
import { homedir } from "os";
import { mkdirSync, unlinkSync, writeFileSync } from "fs";
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
import { isDaemonRunning } from "./session-start";
import { getClaudeDaemonPidPath } from "./paths";

const writePidFile = (pidPath: string) =>
    writeFileSync(pidPath, process.pid.toString(), {
        encoding: "utf8",
        flag: "wx",
    });

const deletePidFile = (pidPath: string) => unlinkSync(pidPath);

export async function runDaemon(): Promise<never> {
    const logger = new ClaudeCodeLogger();
    logger.info("Starting daemon...");

    if (isDaemonRunning()) {
        logger.info("Daemon already running");
        process.exit(0);
    }

    const pidPath = getClaudeDaemonPidPath();
    mkdirSync(dirname(pidPath), { recursive: true });
    try {
        writePidFile(pidPath);
    } catch (error: any) {
        if (error?.code === "EEXIST") {
            if (isDaemonRunning()) {
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

    const errorHandler = new ClaudeCodeErrorHandler();
    const uvRunner = new ClaudeCodeUvRunner();
    const discoverer = new ClaudeCodeConfigDiscoverer();

    await uvRunner.initialize();
    const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude");
    await configMonitor.startMonitoring(uvRunner, discoverer);

    const workspaceRoots = await parseClaudeProjects(homedir());
    await initializeHooks(uvRunner, workspaceRoots, logger, "claude-code");

    const hooksJsonPath = join(process.env.CLAUDE_PLUGIN_ROOT!, "hooks", "hooks.json");
    const hooksMonitor = new ClaudeCodeHooksMonitor(hooksJsonPath, errorHandler, logger);

    const settingsFiles = [getClaudeUserSettingsPath()];
    const globalSettings = getClaudeGlobalSettingsPath();
    if (globalSettings) {
        settingsFiles.push(globalSettings);
    }
    await hooksMonitor.startMonitoring(settingsFiles);

    logger.info("Daemon running");
    return await new Promise<never>(() => {});
}
