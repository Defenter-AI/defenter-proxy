import { join } from "path";
import {
    fileExists,
    getClaudeGlobalSettingsPath,
    getCursorGlobalHooksPath,
    isAccessError,
    listClaudeUsers,
    listCursorUsers,
    parseClaudeProjects,
    parseCursorWorkspaces,
} from "@defenter/common-ts/utils";

/**
 * Discover all Cursor hooks files at all three levels:
 * 1. Project-level: <workspace>/.cursor/hooks.json
 * 2. User-level: ~/.cursor/hooks.json
 * 3. Global/Enterprise-level: /Library/Application Support/Cursor/hooks.json (macOS)
 */
export async function discoverAllCursorHooksFiles(): Promise<Map<string, string[]>> {
    const workspaceRootsByHooksFile = new Map<string, string[]>();
    const allWorkspaceRoots = new Set<string>();

    const users = await listCursorUsers();

    for (const user of users) {
        try {
            const workspaces = await parseCursorWorkspaces(user.homeDir);

            // 1. User-level hooks (~/.cursor/hooks.json)
            const userHooksPath = join(user.homeDir, ".cursor", "hooks.json");
            if (await fileExists(userHooksPath)) {
                workspaceRootsByHooksFile.set(userHooksPath, workspaces);
            }

            for (const workspace of workspaces) {
                const projectHooksPath = join(workspace, ".cursor", "hooks.json");
                if (await fileExists(projectHooksPath)) {
                    workspaceRootsByHooksFile.set(projectHooksPath, [workspace]);
                }
                allWorkspaceRoots.add(workspace);
            }
        } catch (error: any) {
            if (isAccessError(error)) continue;
            throw error;
        }
    }

    const globalHooksPath = getCursorGlobalHooksPath();
    if (globalHooksPath && (await fileExists(globalHooksPath))) {
        workspaceRootsByHooksFile.set(globalHooksPath, Array.from(allWorkspaceRoots));
    }

    return workspaceRootsByHooksFile;
}

/**
 * Discover all Claude Code settings files at user and enterprise levels:
 * 1. User-level: ~/.claude/settings.json
 * 2. Global/Enterprise-level: /Library/Application Support/ClaudeCode/managed-settings.json (macOS)
 */
export async function discoverAllClaudeCodeSettingsFiles(): Promise<Map<string, string[]>> {
    const projectsBySettingsFile = new Map<string, string[]>();
    const allProjects = new Set<string>();

    const users = await listClaudeUsers();
    for (const user of users) {
        try {
            const projects = await parseClaudeProjects(user.homeDir);

            const userSettingsPath = join(user.homeDir, ".claude", "settings.json");
            if (await fileExists(userSettingsPath)) {
                projectsBySettingsFile.set(userSettingsPath, projects);
            }

            for (const project of projects) {
                allProjects.add(project);
            }
        } catch (error: any) {
            if (isAccessError(error)) continue;
            throw error;
        }
    }

    const globalSettingsPath = getClaudeGlobalSettingsPath();
    if (globalSettingsPath && (await fileExists(globalSettingsPath))) {
        projectsBySettingsFile.set(globalSettingsPath, Array.from(allProjects));
    }

    return projectsBySettingsFile;
}
