import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { ConsoleErrorHandler } from "@defenter/common-ts/console";
import {
    getClaudeManagedSettingsPath,
    getClaudeUserSettingsPath,
} from "@defenter/common-ts/utils";
import { ClaudeCodeLogger } from "./logger";
import { reportLifecycleEvent } from "./api";
import { promises as fs } from "fs";
import { join } from "path";
import { getClaudePluginRoot } from "./paths";

async function main() {
    const logger = new ClaudeCodeLogger();
    logger.info("Defenter uninstall cleanup...");

    try {
        await reportLifecycleEvent("uninstall");
    } catch {
        // never crash on lifecycle reporting
    }

    try {
        const errorHandler = new ConsoleErrorHandler();
        const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude-code");

        // 1. Unwrap MCP configurations
        const filesToUnwrap = await configMonitor.getAllWrappedFiles();
        logger.info(`Found ${filesToUnwrap.length} wrapped files`);

        let successCount = 0,
            errorCount = 0;

        for (const filePath of filesToUnwrap) {
            try {
                if (await configMonitor.unwrapConfigurationInFile(filePath)) {
                    successCount++;
                    logger.info(`Unwrapped: ${filePath}`);
                }
            } catch (error: any) {
                errorCount++;
                logger.error(`Failed: ${filePath}`, error);
            }
        }

        logger.info(`MCP configs: ${successCount} unwrapped, ${errorCount} errors`);

        // 2. Unregister Claude Code hooks
        logger.info("Cleaning up Claude Code hooks...");
        try {
            const hooksJsonPath = join(
                getClaudePluginRoot(),
                "hooks",
                "hooks.json"
            );
            const hooksMonitor = new ClaudeCodeHooksMonitor(
                hooksJsonPath,
                errorHandler,
                logger
            );

            const settingsFiles = [getClaudeUserSettingsPath()];
            const globalSettings = getClaudeManagedSettingsPath();
            if (globalSettings) {
                settingsFiles.push(globalSettings);
            }

            await hooksMonitor.unregisterHook(settingsFiles);
            logger.info("Claude Code hooks unregistered");
        } catch (error: any) {
            logger.error("Failed to unregister hooks", error);
        }

        // 3. Clean up registry directories
        try {
            await fs.rmdir(configMonitor.getMcpsDir());
            logger.info("MCP registry cleaned up");
        } catch {}

        logger.info("Defenter uninstall cleanup finished");
    } catch (error) {
        logger.error("Uninstall failed", error);
        process.exit(1);
    }
}

main();
