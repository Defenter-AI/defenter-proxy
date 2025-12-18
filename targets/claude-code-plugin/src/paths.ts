import { homedir } from "os";
import { join } from "path";
import { createHash } from "crypto";

export type ClaudeDaemonScope = "project" | "user" | "managed";

export function getClaudeDefenterDir(): string {
    return join(homedir(), ".defenter", "claude");
}

export function getClaudeVersionFilePath(): string {
    return join(getClaudeDefenterDir(), ".claude-code-version");
}

export function getClaudeDaemonsDir(): string {
    return join(getClaudeDefenterDir(), "daemons");
}

export function getClaudePluginRoot(): string {
    return process.env.CLAUDE_PLUGIN_ROOT ?? join(__dirname, "..");
}

function scopeKey(scope: ClaudeDaemonScope, root?: string): string {
    if (scope !== "project") {
        return scope;
    }
    if (!root) {
        return `${scope}-unknown`;
    }
    const h = createHash("sha256")
        .update(root)
        .digest("hex")
        .slice(0, 8);
    return `${scope}-${h || "unknown"}`;
}

export function getClaudeDaemonPidPath(scope: ClaudeDaemonScope, root?: string): string {
    return join(getClaudeDaemonsDir(), `${scopeKey(scope, root)}.pid`);
}

export function getClaudeLogFilePath(): string {
    return join(getClaudeDefenterDir(), "claude-code.log");
}
