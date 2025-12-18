import { join } from "path";
import {
    fileExists,
    getClaudeManagedSettingsPath,
    getClaudeUserSettingsPath,
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
 *
 * Returns a Map of hooksFilePath -> workspaceRoots[] for each hooks file
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
                // User hooks get all their workspaces
                workspaceRootsByHooksFile.set(userHooksPath, workspaces);
            }

            // 2. Project-level hooks (<workspace>/.cursor/hooks.json)
            for (const workspace of workspaces) {
                const projectHooksPath = join(workspace, ".cursor", "hooks.json");
                if (await fileExists(projectHooksPath)) {
                    // Project hooks get only their workspace root
                    workspaceRootsByHooksFile.set(projectHooksPath, [workspace]);
                }
                allWorkspaceRoots.add(workspace);
            }
        } catch (error: any) {
            if (isAccessError(error)) {
                // Skip users we can't access
                continue;
            }
            throw error;
        }
    }

    // 3. Global enterprise hooks
    const globalHooksPath = getCursorGlobalHooksPath();
    if (globalHooksPath && (await fileExists(globalHooksPath))) {
        // Global hooks get ALL workspace roots from ALL users
        workspaceRootsByHooksFile.set(globalHooksPath, Array.from(allWorkspaceRoots));
    }

    return workspaceRootsByHooksFile;
}

/**
 * Discover all Claude Code settings files at user and enterprise levels:
 * 1. User-level: ~/.claude/settings.json
 * 2. Global/Enterprise-level: /Library/Application Support/ClaudeCode/managed-settings.json (macOS)
 */
export async function discoverAllClaudeCodeSettingsFiles(): Promise<
    Map<string, string[]>
> {
    const projectsBySettingsFile = new Map<string, string[]>();
    const allProjects = new Set<string>();

    const users = await listClaudeUsers();
    for (const user of users) {
        try {
            const projects = await parseClaudeProjects(user.homeDir);

            const userSettingsPath = getClaudeUserSettingsPath(user.homeDir);
            if (await fileExists(userSettingsPath)) {
                projectsBySettingsFile.set(userSettingsPath, projects);
            }

            for (const project of projects) {
                allProjects.add(project);
            }
        } catch (error: any) {
            if (isAccessError(error)) {
                // Skip users we can't access
                continue;
            }
            throw error;
        }
    }

    const globalSettingsPath = getClaudeManagedSettingsPath();
    if (globalSettingsPath && (await fileExists(globalSettingsPath))) {
        projectsBySettingsFile.set(globalSettingsPath, Array.from(allProjects));
    }

    return projectsBySettingsFile;
}
