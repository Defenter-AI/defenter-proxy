import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { getClaudeGlobalSettingsPath, getClaudeUserSettingsPath } from "@defenter/common-ts/utils";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeErrorHandler } from "./errorHandler";
import { reportLifecycleEvent } from "./api";
import { promises as fs } from "fs";
import { join } from "path";

async function main() {
    console.log("Defenter uninstall cleanup...");

    try {
        await reportLifecycleEvent("uninstall");
    } catch {
        // never crash on lifecycle reporting
    }

    try {
        const logger = new ClaudeCodeLogger();
        const errorHandler = new ClaudeCodeErrorHandler();
        const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude");

        // 1. Unwrap MCP configurations
        const filesToUnwrap = await configMonitor.getAllWrappedFiles();
        console.log(`Found ${filesToUnwrap.length} wrapped files`);

        let successCount = 0, errorCount = 0;

        for (const filePath of filesToUnwrap) {
            try {
                if (await configMonitor.unwrapConfigurationInFile(filePath)) {
                    successCount++;
                    console.log(`Unwrapped: ${filePath}`);
                }
            } catch (error: any) {
                errorCount++;
                console.error(`Failed: ${filePath}:`, error.message);
            }
        }

        console.log(`MCP configs: ${successCount} unwrapped, ${errorCount} errors`);

        // 2. Unregister Claude Code hooks
        console.log("Cleaning up Claude Code hooks...");
        try {
            const hooksJsonPath = join(process.env.CLAUDE_PLUGIN_ROOT || __dirname, "hooks", "hooks.json");
            const hooksMonitor = new ClaudeCodeHooksMonitor(hooksJsonPath, errorHandler, logger);

            const settingsFiles = [getClaudeUserSettingsPath()];
            const globalSettings = getClaudeGlobalSettingsPath();
            if (globalSettings) {
                settingsFiles.push(globalSettings);
            }

            await hooksMonitor.unregisterHook(settingsFiles);
            console.log("Claude Code hooks unregistered");
        } catch (error: any) {
            console.error("Failed to unregister hooks:", error.message);
        }

        // 3. Clean up registry directories
        try {
            await fs.rmdir(configMonitor.getMcpsDir());
            console.log("MCP registry cleaned up");
        } catch {}

        console.log("Defenter uninstall cleanup finished");
    } catch (error) {
        console.error("Uninstall failed:", error);
        process.exit(1);
    }
}

main();
