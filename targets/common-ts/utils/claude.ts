import { join } from "path";
import { homedir } from "os";
import { promises as fs } from "fs";
import { fileExists, listIdeUsers, mapOS } from "./index";

/**
 * List all users who have Claude Code installed
 */
export function listClaudeUsers() {
    return listIdeUsers(".claude");
}

/**
 * Parse Claude Code projects from ~/.claude/projects directory
 * Folder names are paths with / replaced by -
 */
export async function parseClaudeProjects(userHomeDir: string): Promise<string[]> {
    const projectsDir = join(userHomeDir, ".claude", "projects");
    if (!(await fileExists(projectsDir))) {
        return [];
    }

    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const projects: string[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
            continue;
        }
        // Convert folder name back to path: -Users-foo-bar -> /Users/foo/bar
        const projectPath = "/" + entry.name.slice(1).replace(/-/g, "/");
        if (await fileExists(projectPath)) {
            projects.push(projectPath);
        }
    }

    return projects;
}

export function getClaudeProjectMcpConfigPaths(projectRoot: string): string[] {
    return [
        join(projectRoot, "mcp.json"),
        join(projectRoot, ".mcp.json"),
        join(projectRoot, ".claude", "mcp.json"),
    ];
}

export function getClaudeUserMcpConfigPath(userHomeDir?: string): string {
    return join(userHomeDir ?? homedir(), ".claude", "mcp.json");
}

export function getClaudeUserSettingsPath(userHomeDir?: string): string {
    return join(userHomeDir ?? homedir(), ".claude", "settings.json");
}

export function getClaudeProjectSettingsPaths(projectRoot: string): string[] {
    return [
        join(projectRoot, ".claude", "settings.json"),
        join(projectRoot, ".claude", "settings.local.json"),
    ];
}

export function getClaudeManagedSettingsPath(): string | undefined {
    switch (mapOS()) {
        case "macos":
            return "/Library/Application Support/ClaudeCode/managed-settings.json";
        case "linux":
            return "/etc/claude-code/managed-settings.json";
        case "windows":
            return "C:\\Program Files\\ClaudeCode\\managed-settings.json";
        default:
            return undefined;
    }
}

export function getClaudeManagedMcpPath(): string | undefined {
    switch (mapOS()) {
        case "macos":
            return "/Library/Application Support/ClaudeCode/managed-mcp.json";
        case "linux":
            return "/etc/claude-code/managed-mcp.json";
        case "windows":
            return "C:\\Program Files\\ClaudeCode\\managed-mcp.json";
        default:
            return undefined;
    }
}

export function parseClaudeHookJson(stdin?: string | Buffer): any | undefined {
    if (!stdin) {
        return undefined;
    }
    try {
        const text = Buffer.isBuffer(stdin) ? stdin.toString("utf8") : stdin;
        if (!text.trim()) {
            return undefined;
        }
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

export function buildClaudeCodeHooksInitInput(opts: {
    workspaceRoots: string[];
    stdin?: string | Buffer;
    cwdOverride?: string;
}): string {
    const nowId = `${Date.now()}`.slice(-8);
    const parsed = parseClaudeHookJson(opts.stdin);
    const sessionId =
        (typeof parsed?.session_id === "string" && parsed.session_id) || nowId;
    const cwd =
        opts.cwdOverride ||
        (typeof parsed?.cwd === "string" && parsed.cwd) ||
        opts.workspaceRoots[0] ||
        process.cwd();
    return JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: sessionId,
        cwd,
    });
}
