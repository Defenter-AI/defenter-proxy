import { join } from "path";
import { homedir } from "os";
import { writePidFile, setupDaemonSignalHandlers } from "@defenter/common-ts/daemon";

/**
 * Daemonize the process for background execution
 */
export function daemonize(): void {
    const pidFile = join(homedir(), ".defenter", "jamf.pid");

    writePidFile(pidFile);

    console.log(`Jamf monitor daemonized with PID ${process.pid}`);
    console.log(`PID file: ${pidFile}`);

    setupDaemonSignalHandlers(() => {
        console.log("Shutting down jamf monitor...");
        process.exit(0);
    });
}
