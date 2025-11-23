import { IErrorHandler } from "@defenter/common-ts/types";
import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

/**
 * Jamf-specific error handler
 * Logs errors to file instead of showing UI
 */
export class JamfErrorHandler implements IErrorHandler {
    private logPath: string;

    constructor() {
        this.logPath = join(homedir(), ".defenter", "jamf-errors.log");

        try {
            mkdirSync(dirname(this.logPath), { recursive: true });
        } catch {}
    }

    showError(message: string): void {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ERROR: ${message}\n`;

        try {
            appendFileSync(this.logPath, logLine, "utf8");
        } catch (e) {
            console.error("Failed to write error log:", e);
        }

        console.error(message);
    }
}
