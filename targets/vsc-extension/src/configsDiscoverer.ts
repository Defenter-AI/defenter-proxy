import { join, normalize, resolve } from "path";
import { homedir } from "os";
import * as vscode from "vscode";
import log from "./log";
import { fileExists, getIdeSystemConfigPaths } from "@defenter/common-ts/utils";
import { IConfigDiscoverer } from "@defenter/common-ts/types";

/**
 * VSCode-specific configuration file discoverer
 * Uses vscode.workspace API to discover MCP config files
 */
export class VscodeConfigDiscoverer implements IConfigDiscoverer {
    /**
     * Discover MCP configuration files in workspace and system locations
     */
    async discoverConfigFiles(): Promise<string[]> {
        const configs: string[] = [];
        const aiClientType = this.detectAIClientType();

        /**
         * Find MCP configuration files in workspace
         */
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const workspacePath = folder.uri.fsPath;

                // Generic workspace configs (always included)
                const genericPaths = [
                    join(workspacePath, "mcp.json"),
                    join(workspacePath, ".mcp.json"),
                ];

                // Client-specific workspace configs (only for detected AI client)
                const getClientWorkspacePath = (clientName: string, subdir?: string) =>
                    join(workspacePath, `.${clientName}`, subdir || "", "mcp.json");

                const clientPaths: Record<string, string[]> = {
                    kiro: [getClientWorkspacePath("kiro", "settings")],
                    antigravity: [getClientWorkspacePath("vscode")],
                    cursor: [getClientWorkspacePath("cursor")],
                    windsurf: [getClientWorkspacePath("windsurf")],
                    claude: [getClientWorkspacePath("claude")],
                    vscode: [getClientWorkspacePath("vscode")],
                    cline: [getClientWorkspacePath("cline")],
                };
                const clientSpecificPaths = clientPaths[aiClientType] || [];

                // Check all paths in parallel for better performance
                const allPaths = [...new Set([...genericPaths, ...clientSpecificPaths])];
                const workspaceConfigs = await this.findExistingFiles(
                    allPaths,
                    aiClientType,
                    "workspace"
                );
                configs.push(...workspaceConfigs);
            }
        }

        /**
         * Find system-wide MCP configuration files
         */
        const systemPaths = getIdeSystemConfigPaths(homedir());
        const systemConfigPaths = systemPaths[aiClientType] || [];
        const systemConfigs = await this.findExistingFiles(
            systemConfigPaths,
            aiClientType,
            "system"
        );
        configs.push(...systemConfigs);

        // Deduplicate paths (multiple workspaces can add the same file twice)
        return Array.from(new Set(configs.map(p => normalize(resolve(p)))));
    }

    /**
     * Detect the AI client type based on VS Code variant
     */
    private detectAIClientType(): string {
        const extensionHost = vscode.env.appName?.toLowerCase() ?? "_unknown";
        const executablePath = process.execPath.toLowerCase();

        log.debug(
            `Detecting AI client: appName="${vscode.env.appName ?? "_unknown"}", execPath="${process.execPath}"`
        );

        // Define client patterns for DRY detection
        const clientPatterns = [
            { name: "cursor", patterns: ["cursor"] },
            { name: "antigravity", patterns: ["antigravity"] },
            { name: "windsurf", patterns: ["windsurf"] },
            { name: "claude", patterns: ["claude"] },
            { name: "kiro", patterns: ["kiro"] },
            { name: "cline", patterns: ["cline"] },
            {
                name: "vscode",
                patterns: [
                    "autopilot",
                    "github copilot",
                    "visual studio code",
                    "code",
                    "vscode",
                ],
            },
        ];

        // Check app name first
        for (const client of clientPatterns) {
            for (const pattern of client.patterns) {
                if (extensionHost.includes(pattern) || extensionHost === pattern) {
                    log.debug(
                        `Detected AI client: ${client.name} (via appName - ${pattern})`
                    );
                    return client.name;
                }
            }
        }

        // Fallback to executable path
        for (const client of clientPatterns) {
            for (const pattern of client.patterns) {
                if (executablePath.includes(pattern)) {
                    log.debug(
                        `Detected AI client: ${client.name} (via execPath - ${pattern})`
                    );
                    return client.name;
                }
            }
        }

        // Log detection failure for debugging
        log.warn(
            `Could not detect AI client type. appName: ${extensionHost}, execPath: ${executablePath}`
        );
        log.warn(
            'Defaulting to "unknown" - will not modify any client-specific configurations'
        );

        // Conservative default - don't modify anything if we can't detect
        return "unknown";
    }

    /**
     * Check multiple file paths in parallel and return existing ones
     */
    private async findExistingFiles(
        paths: string[],
        clientType: string,
        context: string
    ): Promise<string[]> {
        const existenceChecks = await Promise.allSettled(
            paths.map(async configPath => ({
                path: configPath,
                exists: await fileExists(configPath),
            }))
        );

        const existingFiles: string[] = [];
        for (const result of existenceChecks) {
            if (result.status === "fulfilled" && result.value.exists) {
                existingFiles.push(result.value.path);
                log.debug(
                    `Found ${context} config for ${clientType}: ${result.value.path}`
                );
            }
        }
        return existingFiles;
    }
}
