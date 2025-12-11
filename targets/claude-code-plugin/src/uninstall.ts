import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeErrorHandler } from "./errorHandler";
import { promises as fs } from "fs";

async function main() {
    console.log("Defenter uninstall cleanup...");

    try {
        const configMonitor = new ConfigurationMonitor(
            new ClaudeCodeErrorHandler(),
            new ClaudeCodeLogger(),
            "claude"
        );

        const filesToUnwrap = await configMonitor.getAllWrappedFiles();
        console.log(`Found ${filesToUnwrap.length} wrapped files`);

        if (!filesToUnwrap.length) return;

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

        console.log(`Done: ${successCount} unwrapped, ${errorCount} errors`);

        try {
            await fs.rmdir(configMonitor.getMcpsDir());
        } catch {}
    } catch (error) {
        console.error("Uninstall failed:", error);
        process.exit(1);
    }
}

main();
