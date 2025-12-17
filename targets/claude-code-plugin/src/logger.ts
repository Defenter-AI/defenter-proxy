import { appendFileSync, mkdirSync } from "fs";
import { ConsoleLogger } from "@defenter/common-ts/console";
import type { ILogger } from "@defenter/common-ts/types";
import { getClaudeDefenterDir, getClaudeLogFilePath } from "./paths";

function fmtArg(arg: unknown): string {
    if (arg instanceof Error) {
        return arg.stack ?? arg.message;
    }
    if (typeof arg === "string") {
        return arg;
    }
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

export class ClaudeCodeLogger implements ILogger {
    private readonly consoleLogger = new ConsoleLogger();
    private readonly logFilePath = getClaudeLogFilePath();

    constructor() {
        try {
            mkdirSync(getClaudeDefenterDir(), { recursive: true });
        } catch {}
    }

    private write(level: string, message: string, args: unknown[]): void {
        try {
            const tail = args.length ? ` ${args.map(fmtArg).join(" ")}` : "";
            appendFileSync(
                this.logFilePath,
                `${new Date().toISOString()} (${level}) ${message}${tail}\n`,
                "utf8"
            );
        } catch {}
    }

    debug(message: string, ...args: unknown[]): void {
        this.consoleLogger.debug(message, ...args);
        this.write("D", message, args);
    }

    info(message: string, ...args: unknown[]): void {
        this.consoleLogger.info(message, ...args);
        this.write("I", message, args);
    }

    warn(message: string, ...args: unknown[]): void {
        this.consoleLogger.warn(message, ...args);
        this.write("W", message, args);
    }

    error(message: string, error?: unknown): void {
        this.consoleLogger.error(message, error);
        this.write("E", message, error === undefined ? [] : [error]);
    }
}
