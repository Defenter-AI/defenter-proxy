import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { CursorHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeCursorHooks } from "@defenter/common-ts/hooks/initialize";
import { ILogger } from "@defenter/common-ts/types";
import { JamfConfigDiscoverer } from "./configDiscoverer";
import { discoverAllHooksFiles } from "./hooksDiscoverer";
import { JamfErrorHandler } from "./errorHandler";
import { JamfUvRunner } from "./uvRunner";
import { daemonize } from "./daemon";
import { VERSION } from "./version";

/**
 * Console logger for jamf
 */
class JamfLogger implements ILogger {
    debug(message: string, ...args: any[]): void {
        console.log(`[DEBUG] ${message}`, ...args);
    }
    info(message: string, ...args: any[]): void {
        console.log(`[INFO] ${message}`, ...args);
    }
    warn(message: string, ...args: any[]): void {
        console.warn(`[WARN] ${message}`, ...args);
    }
    error(message: string, error?: any): void {
        console.error(`[ERROR] ${message}`, error);
    }
}

async function main() {
    const isDaemon = process.argv.includes("--daemon");

    if (isDaemon) {
        daemonize();
    }

    const errorHandler = new JamfErrorHandler();
    const logger = new JamfLogger();
    const version = VERSION;

    const uvRunner = new JamfUvRunner(version);
    await uvRunner.initialize();

    // Start MCP config monitoring
    const currentIDE = "cursor"; // For jamf, we assume Cursor context
    const configMonitor = new ConfigurationMonitor(errorHandler, logger, currentIDE);
    const discoverer = new JamfConfigDiscoverer();
    await configMonitor.startMonitoring(uvRunner, discoverer);

    // Start Cursor hooks monitoring
    const hooksConfig = await discoverAllHooksFiles();

    // Initialize Cursor hooks API for each unique set of workspace roots
    await Promise.allSettled(
        Array.from(hooksConfig.values()).map(workspaceRoots =>
            initializeCursorHooks(uvRunner, workspaceRoots, logger)
        )
    );

    // Start monitoring all hooks files
    const extensionPath = process.env.DEFENTER_EXTENSION_PATH || __dirname;
    const hooksMonitor = new CursorHooksMonitor(extensionPath, errorHandler, logger);
    await hooksMonitor.startMonitoring(Array.from(hooksConfig.keys()));

    logger.info("Hooks monitoring started successfully");

    // Keep process alive
    await new Promise(() => {});
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
