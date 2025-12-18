import { join, normalize, resolve } from "path";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import {
    fileExists,
    getClaudeManagedMcpPath,
    getClaudeProjectMcpConfigPaths,
    getClaudeUserMcpConfigPath,
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
    private readonly ide: string;

    constructor(ide: string) {
        if (ide !== "cursor" && ide !== "claude-code") {
            throw new Error(`Invalid ide: ${ide}`);
        }
        this.ide = ide;
    }

    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];

        switch (this.ide) {
            case "cursor": {
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

                const globalPaths = getGlobalMcpConfigPaths();
                await collectExistingPaths(globalPaths.cursor || [], configs);
                break;
            }
            case "claude-code": {
                const claudeUsers = await listClaudeUsers();

                for (const user of claudeUsers) {
                    try {
                        await collectExistingPaths(
                            [getClaudeUserMcpConfigPath(user.homeDir)],
                            configs
                        );
                        const projects = await parseClaudeProjects(user.homeDir);

                        for (const project of projects) {
                            await collectExistingPaths(
                                getClaudeProjectMcpConfigPaths(project),
                                configs
                            );
                        }
                    } catch (error: any) {
                        if (isAccessError(error)) continue;
                        throw error;
                    }
                }

                await collectIdeSystemConfigs(claudeUsers, "claude-code", configs);

                const globalPaths = getGlobalMcpConfigPaths();
                await collectExistingPaths(globalPaths["claude-code"] || [], configs);
                const claudeManagedMcp = getClaudeManagedMcpPath();
                if (claudeManagedMcp) {
                    await collectExistingPaths([claudeManagedMcp], configs);
                }
                break;
            }
        }

        return Array.from(new Set(configs.map(p => normalize(p))));
    }
}
