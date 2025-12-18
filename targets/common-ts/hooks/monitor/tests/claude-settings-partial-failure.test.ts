import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ClaudeCodeHooksMonitor } from "../index";
import type { IErrorHandler, ILogger } from "@defenter/common-ts/types";

class TestErrorHandler implements IErrorHandler {
    showError(_message: string): void {}
}

class TestLogger implements ILogger {
    info(_message: string): void {}
    warn(_message: string): void {}
    error(_message: string, _error?: any): void {}
    debug(_message: string): void {}
}

describe("ClaudeCodeHooksMonitor - partial failure", () => {
    let dir: string;
    let hooksJsonPath: string;
    let settingsOk: string;
    let settingsNoWrite: string;

    beforeEach(async () => {
        dir = join(tmpdir(), `test-claude-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await fs.mkdir(dir, { recursive: true });

        hooksJsonPath = join(dir, "hooks.json");
        await fs.writeFile(
            hooksJsonPath,
            JSON.stringify(
                {
                    hooks: {
                        SessionStart: [
                            {
                                hooks: [{ type: "command", command: "node /tmp/launcher.js session-start" }],
                            },
                        ],
                    },
                },
                null,
                2
            ),
            "utf8"
        );

        settingsOk = join(dir, "settings.json");
        await fs.writeFile(settingsOk, JSON.stringify({}), "utf8");

        settingsNoWrite = join(dir, "settings.local.json");
        await fs.writeFile(settingsNoWrite, JSON.stringify({}), "utf8");
        await fs.chmod(settingsNoWrite, 0o444);
    });

    afterEach(async () => {
        try {
            await fs.chmod(settingsNoWrite, 0o644);
        } catch {}
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch {}
    });

    it("keeps monitoring other settings when one file can't be written", async () => {
        const monitor = new ClaudeCodeHooksMonitor(hooksJsonPath, new TestErrorHandler(), new TestLogger());

        await expect(monitor.startMonitoring([settingsOk, settingsNoWrite])).resolves.not.toThrow();

        const ok = JSON.parse(await fs.readFile(settingsOk, "utf8"));
        expect(ok.hooks?.SessionStart?.length).toBeGreaterThan(0);

        await monitor.stopMonitoring();
    });
});
