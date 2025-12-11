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

/**
 * Get the global/enterprise settings file path for Claude Code
 */
export function getClaudeGlobalSettingsPath(): string | undefined {
    const platform = mapOS();
    switch (platform) {
        case "macos":
            return "/Library/Application Support/ClaudeCode/managed-settings.json";
        case "windows":
            return "C:\\ProgramData\\Claude\\managed-settings.json";
        default:
            return undefined;
    }
}

/**
 * Get the user-level settings file path for Claude Code
 */
export function getClaudeUserSettingsPath(): string {
    return join(homedir(), ".claude", "settings.json");
}
