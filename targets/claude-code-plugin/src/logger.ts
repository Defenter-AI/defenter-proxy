import { ILogger } from "@defenter/common-ts/types";

export class ClaudeCodeLogger implements ILogger {
    debug(message: string, ...args: any[]): void { console.log(`[DEBUG] ${message}`, ...args); }
    info(message: string, ...args: any[]): void { console.log(`[INFO] ${message}`, ...args); }
    warn(message: string, ...args: any[]): void { console.warn(`[WARN] ${message}`, ...args); }
    error(message: string, error?: any): void { console.error(`[ERROR] ${message}`, error); }
}
