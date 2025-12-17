#!/usr/bin/env node
import { spawn } from "child_process";
import { isDaemonRunning, sessionStart } from "./session-start";
import { runDaemon } from "./daemon";
import { ClaudeCodeLogger } from "./logger";
import { ensureUvxReady } from "./uvx";
import { VERSION } from "./version";

const logger = new ClaudeCodeLogger();

async function main(logger: ClaudeCodeLogger) {
    const command = process.argv[2];

    switch (command) {
        case "session-start": {
            await sessionStart();
            break;
        }
        case "hook": {
            // ensure uvx and daemon
            if (!isDaemonRunning()) {
                await sessionStart();
            }

            const uvxExecutable =
                process.env.DEFENTER_UVX_EXECUTABLE ??
                (await ensureUvxReady(logger, VERSION));
            process.env.DEFENTER_UVX_EXECUTABLE = uvxExecutable;

            // Execute defenter-proxy, passing through stdin/stdout
            const proc = spawn(
                uvxExecutable,
                ["defenter-proxy", "--ide-tool", "--ide", "claude-code"],
                {
                    stdio: "inherit",
                }
            );
            proc.on("close", code => process.exit(code ?? 0));
            proc.on("error", err => {
                logger.error("Failed to run uvx defenter-proxy", err);
                process.exit(1);
            });
            break;
        }
        case "daemon": {
            await runDaemon();
            break;
        }
        default: {
            logger.error(`Unknown command: ${command}`);
            logger.error("Usage: launcher.js <session-start|hook|daemon>");
            process.exit(1);
            break;
        }
    }
}

main(logger).catch(error => {
    logger.error("Fatal error", error);
    process.exit(1);
});
