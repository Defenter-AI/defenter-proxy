import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { ClaudeCodeConfigDiscoverer } from "./configDiscoverer";
import { ClaudeCodeUvRunner } from "./uvRunner";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeErrorHandler } from "./errorHandler";

async function main() {
    const logger = new ClaudeCodeLogger();
    const errorHandler = new ClaudeCodeErrorHandler();
    const uvRunner = new ClaudeCodeUvRunner();
    const discoverer = new ClaudeCodeConfigDiscoverer();

    logger.info("Starting Defenter daemon...");
    await uvRunner.initialize();

    const configMonitor = new ConfigurationMonitor(errorHandler, logger, "claude");
    await configMonitor.startMonitoring(uvRunner, discoverer);

    logger.info("Daemon running");
    await new Promise(() => {});
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
