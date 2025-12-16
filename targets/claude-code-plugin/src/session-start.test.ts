import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawn, execSync } from "child_process";
import {
    getDaemonPidPath,
    isDaemonRunning,
    getVersionFilePath,
    getStoredVersion,
    saveVersion,
} from "./session-start";

function isProcessRunning(pid: number): boolean {
    try {
        execSync(`ps -p ${pid}`, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

describe("session-start", () => {
    let testDir: string;

    beforeEach(() => {
        testDir = join(tmpdir(), `defenter-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        try {
            const files = require("fs").readdirSync(testDir);
            for (const file of files) {
                unlinkSync(join(testDir, file));
            }
            require("fs").rmdirSync(testDir);
        } catch {}
    });

    describe("getDaemonPidPath", () => {
        it("returns path under .defenter/.wrapped_mcps/claude", () => {
            const pidPath = getDaemonPidPath();
            expect(pidPath).toContain(".defenter");
            expect(pidPath).toContain(".wrapped_mcps");
            expect(pidPath).toContain("claude");
            expect(pidPath).toContain("daemon.pid");
        });
    });

    describe("isDaemonRunning", () => {
        it("returns false when PID file does not exist", () => {
            // Default state - no PID file
            const pidPath = getDaemonPidPath();
            if (existsSync(pidPath)) {
                unlinkSync(pidPath);
            }
            expect(isDaemonRunning()).toBe(false);
        });

        it("returns true when PID file exists and process is running", () => {
            const pidPath = getDaemonPidPath();
            const dir = join(pidPath, "..");
            mkdirSync(dir, { recursive: true });

            // Write current process PID (which is definitely running)
            writeFileSync(pidPath, process.pid.toString(), "utf8");

            try {
                expect(isDaemonRunning()).toBe(true);
            } finally {
                unlinkSync(pidPath);
            }
        });

        it("returns false and cleans up stale PID file when process is not running", () => {
            const pidPath = getDaemonPidPath();
            const dir = join(pidPath, "..");
            mkdirSync(dir, { recursive: true });

            // Write a PID that definitely doesn't exist (very high number)
            writeFileSync(pidPath, "999999999", "utf8");

            expect(isDaemonRunning()).toBe(false);
            // PID file should be cleaned up
            expect(existsSync(pidPath)).toBe(false);
        });

        it("returns false when PID file contains invalid data", () => {
            const pidPath = getDaemonPidPath();
            const dir = join(pidPath, "..");
            mkdirSync(dir, { recursive: true });

            writeFileSync(pidPath, "not-a-number", "utf8");

            try {
                expect(isDaemonRunning()).toBe(false);
            } finally {
                if (existsSync(pidPath)) {
                    unlinkSync(pidPath);
                }
            }
        });

        it("correlates with actual ps verification", () => {
            const pidPath = getDaemonPidPath();
            const dir = join(pidPath, "..");
            mkdirSync(dir, { recursive: true });

            // Write current process PID
            writeFileSync(pidPath, process.pid.toString(), "utf8");

            try {
                // Both isDaemonRunning and ps should agree
                expect(isDaemonRunning()).toBe(true);
                expect(isProcessRunning(process.pid)).toBe(true);
            } finally {
                unlinkSync(pidPath);
            }

            // Write non-existent PID
            writeFileSync(pidPath, "999999999", "utf8");

            // Both should agree it's not running
            expect(isDaemonRunning()).toBe(false);
            expect(isProcessRunning(999999999)).toBe(false);
        });
    });

    describe("version management", () => {
        it("getVersionFilePath returns path under .defenter", () => {
            const versionPath = getVersionFilePath();
            expect(versionPath).toContain(".defenter");
            expect(versionPath).toContain(".claude-code-version");
        });

        it("getStoredVersion returns undefined when file does not exist", () => {
            const versionPath = getVersionFilePath();
            if (existsSync(versionPath)) {
                unlinkSync(versionPath);
            }
            expect(getStoredVersion()).toBeUndefined();
        });

        it("saveVersion and getStoredVersion roundtrip", () => {
            const testVersion = "1.2.3-test";
            const versionPath = getVersionFilePath();

            try {
                saveVersion(testVersion);
                expect(getStoredVersion()).toBe(testVersion);
            } finally {
                if (existsSync(versionPath)) {
                    unlinkSync(versionPath);
                }
            }
        });
    });
});

describe("daemon PID file integration", () => {
    const pidPath = getDaemonPidPath();

    afterEach(() => {
        if (existsSync(pidPath)) {
            unlinkSync(pidPath);
        }
    });

    it("daemon writes PID file on start and cleans up on SIGTERM", async () => {
        const pidPath = getDaemonPidPath();

        // Clean up any existing PID file
        if (existsSync(pidPath)) {
            unlinkSync(pidPath);
        }

        // Spawn a mock daemon that writes PID and waits
        const mockDaemon = spawn("node", ["-e", `
            const { mkdirSync, writeFileSync, unlinkSync } = require("fs");
            const { dirname } = require("path");
            const pidPath = "${pidPath.replace(/\\/g, "\\\\")}";
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");
            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            process.on("SIGINT", cleanup);
            setTimeout(() => {}, 60000);
        `], { detached: true, stdio: "ignore" });

        // Wait for PID file to be written
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            // Verify PID file exists and contains valid PID
            expect(existsSync(pidPath)).toBe(true);
            const writtenPid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
            expect(writtenPid).toBe(mockDaemon.pid);

            // isDaemonRunning should return true
            expect(isDaemonRunning()).toBe(true);

            // Send SIGTERM
            process.kill(mockDaemon.pid!, "SIGTERM");

            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));

            // PID file should be cleaned up
            expect(existsSync(pidPath)).toBe(false);
            expect(isDaemonRunning()).toBe(false);
        } finally {
            // Ensure process is killed
            try {
                process.kill(mockDaemon.pid!, "SIGKILL");
            } catch {}
            // Clean up PID file if still exists
            if (existsSync(pidPath)) {
                unlinkSync(pidPath);
            }
        }
    }, 10000);

    it("prevents duplicate daemon spawn when one is already running", async () => {
        // Spawn first daemon
        const daemon1 = spawn("node", ["-e", `
            const { mkdirSync, writeFileSync, unlinkSync } = require("fs");
            const { dirname } = require("path");
            const pidPath = "${pidPath.replace(/\\/g, "\\\\")}";
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");
            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            process.on("SIGINT", cleanup);
            setTimeout(() => {}, 60000);
        `], { detached: true, stdio: "ignore" });

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            // Verify first daemon is running
            expect(isDaemonRunning()).toBe(true);
            expect(isProcessRunning(daemon1.pid!)).toBe(true);
            const firstPid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
            expect(firstPid).toBe(daemon1.pid);

            // Simulate what session-start does: check before spawning
            // If isDaemonRunning() is true, it should NOT spawn another
            const shouldSpawn = !isDaemonRunning();
            expect(shouldSpawn).toBe(false);

            // Verify only one process owns the PID file
            const currentPid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
            expect(currentPid).toBe(daemon1.pid);
            expect(isProcessRunning(currentPid)).toBe(true);
        } finally {
            process.kill(daemon1.pid!, "SIGTERM");
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }, 10000);

    it("allows new daemon spawn after previous daemon exits", async () => {
        // Spawn first daemon
        const daemon1 = spawn("node", ["-e", `
            const { mkdirSync, writeFileSync, unlinkSync } = require("fs");
            const { dirname } = require("path");
            const pidPath = "${pidPath.replace(/\\/g, "\\\\")}";
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");
            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            setTimeout(() => {}, 60000);
        `], { detached: true, stdio: "ignore" });

        await new Promise(resolve => setTimeout(resolve, 500));

        const firstPid = daemon1.pid!;
        expect(isDaemonRunning()).toBe(true);
        expect(isProcessRunning(firstPid)).toBe(true);

        // Kill first daemon
        process.kill(firstPid, "SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify first daemon is gone
        expect(isDaemonRunning()).toBe(false);
        expect(isProcessRunning(firstPid)).toBe(false);

        // Spawn second daemon
        const daemon2 = spawn("node", ["-e", `
            const { mkdirSync, writeFileSync, unlinkSync } = require("fs");
            const { dirname } = require("path");
            const pidPath = "${pidPath.replace(/\\/g, "\\\\")}";
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");
            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            setTimeout(() => {}, 60000);
        `], { detached: true, stdio: "ignore" });

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            // Verify second daemon is running with different PID
            expect(isDaemonRunning()).toBe(true);
            expect(isProcessRunning(daemon2.pid!)).toBe(true);
            const secondPid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
            expect(secondPid).toBe(daemon2.pid);
            expect(secondPid).not.toBe(firstPid);
        } finally {
            process.kill(daemon2.pid!, "SIGTERM");
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }, 15000);

    it("handles stale PID file from crashed daemon", async () => {
        const dir = join(pidPath, "..");
        mkdirSync(dir, { recursive: true });

        // Write a stale PID (process that doesn't exist)
        writeFileSync(pidPath, "999999999", "utf8");
        expect(existsSync(pidPath)).toBe(true);

        // Verify ps confirms process is not running
        expect(isProcessRunning(999999999)).toBe(false);

        // isDaemonRunning should return false AND clean up stale file
        expect(isDaemonRunning()).toBe(false);
        expect(existsSync(pidPath)).toBe(false);

        // Now a new daemon should be allowed to spawn
        const daemon = spawn("node", ["-e", `
            const { mkdirSync, writeFileSync, unlinkSync } = require("fs");
            const { dirname } = require("path");
            const pidPath = "${pidPath.replace(/\\/g, "\\\\")}";
            mkdirSync(dirname(pidPath), { recursive: true });
            writeFileSync(pidPath, process.pid.toString(), "utf8");
            const cleanup = () => {
                try { unlinkSync(pidPath); } catch {}
                process.exit(0);
            };
            process.on("SIGTERM", cleanup);
            setTimeout(() => {}, 60000);
        `], { detached: true, stdio: "ignore" });

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            expect(isDaemonRunning()).toBe(true);
            expect(isProcessRunning(daemon.pid!)).toBe(true);
        } finally {
            process.kill(daemon.pid!, "SIGTERM");
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }, 10000);
});
