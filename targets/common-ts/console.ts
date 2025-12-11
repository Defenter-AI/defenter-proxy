import { ILogger, IErrorHandler } from "./types";

/**
 * Console-based logger implementing ILogger
 */
export class ConsoleLogger implements ILogger {
    debug(message: string, ...args: any[]): void {
        console.log(`[DEBUG] ${message}`, ...args);
    }
    info(message: string, ...args: any[]): void {
        console.log(`[INFO] ${message}`, ...args);
    }
    warn(message: string, ...args: any[]): void {
        console.warn(`[WARN] ${message}`, ...args);
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
