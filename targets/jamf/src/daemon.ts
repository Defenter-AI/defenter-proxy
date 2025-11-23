import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

/**
 * Daemonize the process for background execution
 */
export function daemonize(): void {
    const pidFile = join(homedir(), ".defenter", "jamf.pid");

    try {
        mkdirSync(dirname(pidFile), { recursive: true });
    } catch {
        // Ignore if already exists
    }
    writeFileSync(pidFile, process.pid.toString(), "utf8");

    console.log(`Jamf monitor daemonized with PID ${process.pid}`);
    console.log(`PID file: ${pidFile}`);

    const cleanup = () => {
        console.log("Shutting down jamf monitor...");
        process.exit(0);
    };

    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
}
