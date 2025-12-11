import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor, CursorHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeHooks } from "@defenter/common-ts/hooks/initialize";
import { ConsoleLogger } from "@defenter/common-ts/console";
import { JamfConfigDiscoverer } from "./configDiscoverer";
import { discoverAllClaudeCodeSettingsFiles, discoverAllCursorHooksFiles } from "./hooksDiscoverer";
import { JamfErrorHandler } from "./errorHandler";
import { JamfUvRunner } from "./uvRunner";
import { daemonize } from "./daemon";
import { VERSION } from "./version";
import { join } from "path";

async function main() {
    const isDaemon = process.argv.includes("--daemon");

    if (isDaemon) {
        daemonize();
    }

    const errorHandler = new JamfErrorHandler();
    const logger = new ConsoleLogger();
    const version = VERSION;

    const uvRunner = new JamfUvRunner(version);
    await uvRunner.initialize();

    // Start MCP config monitoring
    const currentIDE = "cursor"; // For jamf, we assume Cursor context
    const configMonitor = new ConfigurationMonitor(errorHandler, logger, currentIDE);
    const discoverer = new JamfConfigDiscoverer();
    await configMonitor.startMonitoring(uvRunner, discoverer);

    // Discover Cursor hooks files and their associated workspaces
    const cursorHooksFiles = await discoverAllCursorHooksFiles();

    // Initialize Cursor hooks API for each hooks file
    await Promise.allSettled(
        Array.from(cursorHooksFiles.values()).map(workspaceRoots =>
            initializeHooks(uvRunner, workspaceRoots, logger, "cursor")
        )
    );

    // Start monitoring all Cursor hooks files
    const extensionPath = process.env.DEFENTER_EXTENSION_PATH || __dirname;
    const cursorHooksMonitor = new CursorHooksMonitor(extensionPath, errorHandler, logger);
    await cursorHooksMonitor.startMonitoring(Array.from(cursorHooksFiles.keys()));

    logger.info("Cursor hooks monitoring started successfully");

    // Discover Claude Code settings files and their associated projects
    const claudeSettingsFiles = await discoverAllClaudeCodeSettingsFiles();

    // Initialize Claude Code hooks API for each settings file
    await Promise.allSettled(
        Array.from(claudeSettingsFiles.values()).map(projects =>
            initializeHooks(uvRunner, projects, logger, "claude-code")
        )
    );

    const claudeHooksJsonPath = join(__dirname, "hooks", "hooks.json");
    const claudeHooksMonitor = new ClaudeCodeHooksMonitor(claudeHooksJsonPath, errorHandler, logger);
    await claudeHooksMonitor.startMonitoring(Array.from(claudeSettingsFiles.keys()));

    logger.info("Claude Code hooks monitoring started successfully");

    // Keep process alive
    await new Promise(() => {});
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
