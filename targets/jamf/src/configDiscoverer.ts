import { join, normalize, resolve } from "path";
import { homedir } from "os";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import { fileExists, getIdeSystemConfigPaths } from "@defenter/common-ts/utils";
import { parseCursorWorkspaces } from "@defenter/common-ts/discovery/cursorStorageParser";

/**
 * Discovers MCP config files across all Cursor workspaces
 */
export class JamfConfigDiscoverer implements IConfigDiscoverer {
    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];

        const workspaces = await parseCursorWorkspaces();

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

        // Check system-wide configs
        const allSystemPaths = getIdeSystemConfigPaths(homedir());
        // Cursor-specific for jamf
        const systemPaths = allSystemPaths.cursor || [];

        for (const path of systemPaths) {
            if (await fileExists(path)) {
                configs.push(resolve(path));
            }
        }

        // Deduplicate
        return Array.from(new Set(configs.map(p => normalize(p))));
    }
}
