import { join, normalize, resolve } from "path";
import { IConfigDiscoverer } from "@defenter/common-ts/types";
import {
    fileExists,
    getClaudeManagedMcpPath,
    getClaudeProjectMcpConfigPaths,
    getClaudeUserMcpConfigPath,
} from "@defenter/common-ts/utils";
import type { ClaudeDaemonScope } from "./paths";

const normalizeUnique = (paths: string[]) =>
    Array.from(new Set(paths.map(p => normalize(resolve(p)))));

async function findExistingFiles(paths: string[]): Promise<string[]> {
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

export class ClaudeCodeConfigDiscoverer implements IConfigDiscoverer {
    private readonly scope: ClaudeDaemonScope;
    private readonly root: string | undefined;

    constructor(scope: ClaudeDaemonScope, root?: string) {
        this.scope = scope;
        this.root = root;
    }

    async discoverConfigFiles(): Promise<string[]> {
        switch (this.scope) {
            case "project": {
                const root = this.root;
                if (!root) {
                    return [];
                }
                const workspacePaths = getClaudeProjectMcpConfigPaths(root);
                return normalizeUnique(await findExistingFiles(workspacePaths));
            }
            case "user": {
                const userPaths = [getClaudeUserMcpConfigPath()];
                return normalizeUnique(await findExistingFiles(userPaths));
            }
            case "managed": {
                const managed = getClaudeManagedMcpPath();
                const paths = managed ? [managed] : [];
                return normalizeUnique(await findExistingFiles(paths));
            }
        }
    }
}
