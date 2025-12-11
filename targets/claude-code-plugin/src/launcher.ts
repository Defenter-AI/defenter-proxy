#!/usr/bin/env node
import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeConfigDiscoverer } from "./configDiscoverer";
import { ClaudeCodeUvRunner } from "./uvRunner";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeErrorHandler } from "./errorHandler";
import { sessionStart } from "./session-start";

async function main() {
    const command = process.argv[2];

    if (command === "session-start") {
        await sessionStart();
    } else if (command === "unwrap") {
        console.log("Unwrapping all Defenter configurations...");
        const logger = new ClaudeCodeLogger();
        const errorHandler = new ClaudeCodeErrorHandler();
        const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude");

        try {
            const wrappedFiles = await configMonitor.getAllWrappedFiles();
            console.log(`Found ${wrappedFiles.length} wrapped configuration files`);

            let successCount = 0;
            let errorCount = 0;

            for (const file of wrappedFiles) {
                try {
                    const unwrapped = await configMonitor.unwrapConfigurationInFile(file);
                    if (unwrapped) {
                        console.log(`Unwrapped: ${file}`);
                        successCount++;
                    }
                } catch (error: any) {
                    console.error(`Failed to unwrap ${file}:`, error.message);
                    errorCount++;
                }
            }

            console.log(`Unwrap complete: ${successCount} succeeded, ${errorCount} failed`);
            process.exit(errorCount > 0 ? 1 : 0);
        } catch (error) {
            console.error("Failed to unwrap configurations:", error);
            process.exit(1);
        }
    } else if (command === "daemon") {
        console.log("Starting daemon...");
        const logger = new ClaudeCodeLogger();
        const errorHandler = new ClaudeCodeErrorHandler();
        const uvRunner = new ClaudeCodeUvRunner();
        const discoverer = new ClaudeCodeConfigDiscoverer();

        await uvRunner.initialize();
        const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude");
        await configMonitor.startMonitoring(uvRunner, discoverer);

        console.log("Daemon running");
        await new Promise(() => {});
    } else {
        console.error(`Unknown command: ${command}`);
        console.error("Usage: launcher.js <session-start|unwrap|daemon>");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
