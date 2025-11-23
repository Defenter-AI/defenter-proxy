import { ConfigurationMonitor } from "@defenter/common-ts/monitors/configurationMonitor";
import { CursorHooksMonitor } from "@defenter/common-ts/monitors/cursorHooksMonitor";
import { ILogger } from "@defenter/common-ts/types";
import { JamfConfigDiscoverer } from "./configDiscoverer";
import { parseCursorWorkspaces } from "@defenter/common-ts/discovery/cursorStorageParser";
import { JamfErrorHandler } from "./errorHandler";
import { JamfUvRunner } from "./uvRunner";
import { daemonize } from "./daemon";
import { VERSION } from "./version";
import { homedir } from "os";
import { join } from "path";

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
    const workspaceRoots = await parseCursorWorkspaces();
    const extensionPath = process.env.DEFENTER_EXTENSION_PATH || __dirname;
    const hooksMonitor = new CursorHooksMonitor(
        join(homedir(), ".cursor", "hooks.json"),
        extensionPath,
        errorHandler,
        logger
    );
    await hooksMonitor.startMonitoring(uvRunner, workspaceRoots);

    console.log("Jamf monitoring started successfully");
    console.log(`Monitoring ${workspaceRoots.length} workspace(s)`);

    // Keep process alive
    await new Promise(() => {});
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
