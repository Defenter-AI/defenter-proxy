#!/usr/bin/env node
import { spawn } from "child_process";
import { parseClaudeHookJson } from "@defenter/common-ts/utils";
import { ensureDaemonRunning, sessionStart } from "./session-start";
import { parseRunDaemonOptions, runDaemonScoped } from "./daemon";
import { ClaudeCodeLogger } from "./logger";
import { ClaudeCodeUvRunner } from "./uvRunner";

const logger = new ClaudeCodeLogger();

async function main(logger: ClaudeCodeLogger) {
    const command = process.argv[2];

    switch (command) {
        case "session-start": {
            const stdin = await readAllStdin();
            await sessionStart(stdin);
            break;
        }
        case "hook": {
            const uvRunner = new ClaudeCodeUvRunner();
            await uvRunner.initialize();

            const stdin = await readAllStdin();
            const parsed = parseClaudeHookJson(stdin);
            const cwd =
                typeof parsed?.cwd === "string" && parsed.cwd
                    ? parsed.cwd
                    : process.cwd();
            ensureDaemonRunning("managed", undefined, stdin);
            ensureDaemonRunning("user", undefined, stdin);
            ensureDaemonRunning("project", cwd, stdin);

            const cmd = uvRunner.getCommand();
            const proc = spawn(
                cmd.executable,
                [...cmd.args, "--ide-tool", "--ide", "claude-code"],
                { stdio: ["pipe", "inherit", "inherit"], shell: false }
            );
            proc.stdin?.end(stdin);

            proc.on("close", code => process.exit(code ?? 0));
            proc.on("error", err => {
                logger.error("Failed to run defenter-proxy", err);
                process.exit(1);
            });
            break;
        }
        case "daemon": {
            const opts = parseRunDaemonOptions(process.argv.slice(3));
            const stdin = await readAllStdin();
            opts.stdin = stdin;
            await runDaemonScoped(opts);
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

function readAllStdin(): Promise<Buffer> {
    return new Promise(resolve => {
        const chunks: Buffer[] = [];
        process.stdin.on("data", c =>
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
        );
        process.stdin.on("end", () => resolve(Buffer.concat(chunks)));
        process.stdin.on("error", () => resolve(Buffer.alloc(0)));
        // If no stdin is piped, Node may not emit end; resolve quickly.
        if (process.stdin.isTTY) {
            resolve(Buffer.alloc(0));
        }
    });
}
