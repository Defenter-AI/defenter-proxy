import { ILogger, IErrorHandler } from "./types";

/**
 * Console-based logger implementing ILogger.
 * All output goes to stderr to avoid polluting stdout,
 * which hooks use for structured JSON output.
 */
export class ConsoleLogger implements ILogger {
    debug(message: string, ...args: any[]): void {
        console.error(`[DEBUG] ${message}`, ...args);
    }
    info(message: string, ...args: any[]): void {
        console.error(`[INFO] ${message}`, ...args);
    }
    warn(message: string, ...args: any[]): void {
        console.error(`[WARN] ${message}`, ...args);
    }
    error(message: string, error?: any): void {
        console.error(`[ERROR] ${message}`, error);
    }
}

/**
 * Console-based error handler implementing IErrorHandler
 */
export class ConsoleErrorHandler implements IErrorHandler {
    showError(message: string): void {
        console.error(message);
    }
}
