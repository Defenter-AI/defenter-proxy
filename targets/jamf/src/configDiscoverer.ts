import { join, normalize, resolve } from "path";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import {
    fileExists,
    getIdeSystemConfigPaths,
    listCursorUsers,
    parseCursorWorkspaces,
} from "@defenter/common-ts/utils";

/**
 * Discovers MCP config files across all Cursor workspaces for all users
 */
export class JamfConfigDiscoverer implements IConfigDiscoverer {
    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];
        const users = await listCursorUsers();

        for (const user of users) {
            try {
                const workspaces = await parseCursorWorkspaces(user.homeDir);

                // Check workspace configs
                for (const workspace of workspaces) {
                    const workspacePaths = [
                        join(workspace, ".cursor", "mcp.json"),
                        join(workspace, "mcp.json"),
                        join(workspace, ".mcp.json"),
                    ];

                    for (const path of workspacePaths) {
                        if (await fileExists(path)) {
                            configs.push(resolve(path));
                        }
                    }
                }

                // Check system-wide configs for this user
                const systemPaths = getIdeSystemConfigPaths(user.homeDir);
                const cursorPaths = systemPaths.cursor || [];

                for (const path of cursorPaths) {
                    if (await fileExists(path)) {
                        configs.push(resolve(path));
                    }
                }
            } catch (error: any) {
                if (error.code === "EACCES" || error.code === "EPERM") {
                    // Skip users we can't access
                    continue;
                }
                throw error;
            }
        }

        // Deduplicate
        return Array.from(new Set(configs.map(p => normalize(p))));
    }
}
