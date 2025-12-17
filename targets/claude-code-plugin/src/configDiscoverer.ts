import { join, normalize, resolve } from "path";
import { homedir } from "os";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import {
    fileExists,
    getGlobalMcpConfigPaths,
    getIdeSystemConfigPaths,
} from "@defenter/common-ts/utils";

export class ClaudeCodeConfigDiscoverer implements IConfigDiscoverer {
    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];
        const projectDir = process.env.CLAUDE_PROJECT_DIR;

        if (projectDir) {
            const workspacePaths = [
                join(projectDir, "mcp.json"),
                join(projectDir, ".mcp.json"),
                join(projectDir, ".claude", "mcp.json"),
            ];
            configs.push(...(await this.findExistingFiles(workspacePaths)));
        }

        const systemPaths = getIdeSystemConfigPaths(homedir()).claude || [];
        configs.push(...(await this.findExistingFiles(systemPaths)));

        // Enterprise/global paths
        const globalPaths = getGlobalMcpConfigPaths().claude || [];
        configs.push(...(await this.findExistingFiles(globalPaths)));

        return Array.from(new Set(configs.map(p => normalize(resolve(p)))));
    }

    private async findExistingFiles(paths: string[]): Promise<string[]> {
        const checks = await Promise.allSettled(
            paths.map(async p => ({ path: p, exists: await fileExists(p) }))
        );
        return checks
            .filter(
                (r): r is PromiseFulfilledResult<{ path: string; exists: boolean }> =>
                    r.status === "fulfilled" && r.value.exists
            )
            .map(r => r.value.path);
    }
}
