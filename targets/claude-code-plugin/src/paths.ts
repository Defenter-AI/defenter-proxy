import { homedir } from "os";
import { join } from "path";

export function getClaudeDefenterDir(): string {
    return join(homedir(), ".defenter", "claude");
}

export function getClaudeVersionFilePath(): string {
    return join(getClaudeDefenterDir(), ".claude-code-version");
}

export function getClaudeDaemonPidPath(): string {
    return join(getClaudeDefenterDir(), "daemon.pid");
}

export function getClaudeLogFilePath(): string {
    return join(getClaudeDefenterDir(), "claude-code.log");
}
