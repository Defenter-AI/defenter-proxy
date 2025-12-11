import { join, normalize, resolve } from "path";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import {
    fileExists,
    getGlobalMcpConfigPaths,
    getIdeSystemConfigPaths,
    isAccessError,
    listClaudeUsers,
    listCursorUsers,
    OSUser,
    parseClaudeProjects,
    parseCursorWorkspaces,
} from "@defenter/common-ts/utils";

async function collectExistingPaths(paths: string[], collector: string[]): Promise<void> {
    for (const path of paths) {
        if (await fileExists(path)) {
            collector.push(resolve(path));
        }
    }
}

async function collectIdeSystemConfigs(
    users: OSUser[],
    ideName: string,
    collector: string[]
): Promise<void> {
    for (const user of users) {
        try {
            const systemPaths = getIdeSystemConfigPaths(user.homeDir);
            const idePaths = systemPaths[ideName] || [];
            await collectExistingPaths(idePaths, collector);
        } catch (error: any) {
            if (isAccessError(error)) continue;
            throw error;
        }
    }
}

/**
 * Discovers MCP config files across all IDE workspaces for all users
 */
export class JamfConfigDiscoverer implements IConfigDiscoverer {
    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];

        // Discover Cursor configs
        const cursorUsers = await listCursorUsers();

        for (const user of cursorUsers) {
            try {
                const workspaces = await parseCursorWorkspaces(user.homeDir);

                for (const workspace of workspaces) {
                    await collectExistingPaths(
                        [
                            join(workspace, ".cursor", "mcp.json"),
                            join(workspace, "mcp.json"),
                            join(workspace, ".mcp.json"),
                        ],
                        configs
                    );
                }
            } catch (error: any) {
                if (isAccessError(error)) continue;
                throw error;
            }
        }

        await collectIdeSystemConfigs(cursorUsers, "cursor", configs);

        // Discover Claude Code configs
        const claudeUsers = await listClaudeUsers();

        for (const user of claudeUsers) {
            try {
                const projects = await parseClaudeProjects(user.homeDir);

                for (const project of projects) {
                    await collectExistingPaths(
                        [
                            join(project, ".claude", "mcp.json"),
                            join(project, "mcp.json"),
                            join(project, ".mcp.json"),
                        ],
                        configs
                    );
                }
            } catch (error: any) {
                if (isAccessError(error)) continue;
                throw error;
            }
        }

        await collectIdeSystemConfigs(claudeUsers, "claude", configs);

        // Discover global/enterprise configs
        const globalPaths = getGlobalMcpConfigPaths();
        await collectExistingPaths(globalPaths.cursor || [], configs);
        await collectExistingPaths(globalPaths.claude || [], configs);

        return Array.from(new Set(configs.map(p => normalize(p))));
    }
}
