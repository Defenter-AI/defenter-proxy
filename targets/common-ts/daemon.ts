import { mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";

/**
 * Write PID file for daemon process
 * @param pidPath - Path to PID file
 * @param exclusive - If true, fails if file exists (atomic creation)
 */
export function writePidFile(pidPath: string, exclusive = false): void {
    mkdirSync(dirname(pidPath), { recursive: true });
    writeFileSync(pidPath, process.pid.toString(), {
        encoding: "utf8",
        flag: exclusive ? "wx" : "w",
    });
}

/**
 * Delete PID file (silent on error)
 */
export function deletePidFile(pidPath: string): void {
    try {
        unlinkSync(pidPath);
    } catch {
        // Ignore - file may not exist
    }
}

/**
 * Setup SIGTERM/SIGINT handlers for daemon cleanup
 */
export function setupDaemonSignalHandlers(cleanup: () => void): void {
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
}
