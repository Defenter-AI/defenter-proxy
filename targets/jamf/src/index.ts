import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor, CursorHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeHooks } from "@defenter/common-ts/hooks/initialize";
import { ConsoleLogger } from "@defenter/common-ts/console";
import { SimpleUvRunner } from "@defenter/common-ts/uv";
import {
    buildClaudeCodeHooksInitInput,
    buildCursorHooksInitInput,
} from "@defenter/common-ts/utils";
import { JamfConfigDiscoverer } from "./configDiscoverer";
import { discoverAllClaudeCodeSettingsFiles, discoverAllCursorHooksFiles } from "./hooksDiscoverer";
import { JamfErrorHandler } from "./errorHandler";
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

    const uvRunner = new SimpleUvRunner(version);
    await uvRunner.initialize();

    // Start MCP config monitoring (per IDE)
    const cursorConfigMonitor = new ConfigurationMonitor(errorHandler, logger, "cursor");
    const cursorDiscoverer = new JamfConfigDiscoverer("cursor");
    await cursorConfigMonitor.startMonitoring(uvRunner, cursorDiscoverer);

    const claudeConfigMonitor = new ConfigurationMonitor(errorHandler, logger, "claude-code");
    const claudeDiscoverer = new JamfConfigDiscoverer("claude-code");
    await claudeConfigMonitor.startMonitoring(uvRunner, claudeDiscoverer);

    // Discover Cursor hooks files and their associated workspaces
    const cursorHooksFiles = await discoverAllCursorHooksFiles();

    // Initialize Cursor hooks API for each hooks file
    await Promise.allSettled(
        Array.from(cursorHooksFiles.values()).map(workspaceRoots =>
            initializeHooks(
                uvRunner,
                buildCursorHooksInitInput(workspaceRoots),
                logger,
                "cursor"
            )
        )
    );

    const jamfExtensionRoot = process.env.DEFENTER_EXTENSION_PATH ?? __dirname;

    // Start monitoring all Cursor hooks files
    const cursorHooksMonitor = new CursorHooksMonitor(jamfExtensionRoot, errorHandler, logger);
    await cursorHooksMonitor.startMonitoring(Array.from(cursorHooksFiles.keys()));

    logger.info("Cursor hooks monitoring started successfully");

    // Discover Claude Code settings files and their associated projects
    const claudeSettingsFiles = await discoverAllClaudeCodeSettingsFiles();

    // Initialize Claude Code hooks API for each settings file
    await Promise.allSettled(
        Array.from(claudeSettingsFiles.values()).map(projects =>
            initializeHooks(
                uvRunner,
                buildClaudeCodeHooksInitInput({ workspaceRoots: projects }),
                logger,
                "claude-code"
            )
        )
    );

    const claudeHooksJsonPath = join(jamfExtensionRoot, "hooks", "hooks.json");
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
