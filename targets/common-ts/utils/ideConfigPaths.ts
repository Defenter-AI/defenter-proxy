import { join } from "path";
import { mapOS } from "./index";
import { getClaudeManagedMcpPath } from "./claude";

/**
 * Get standard system paths for different AI client IDE configurations
 *
 * @param homeDir - User's home directory path
 * @returns Record mapping IDE names to their config file paths
 */
export function getIdeSystemConfigPaths(homeDir: string): Record<string, string[]> {
    const createPaths = (appName: string, subPaths: string[] = []) => [
        join(homeDir, `.${appName.toLowerCase()}`, "mcp.json"),
        ...subPaths.map(subPath => join(homeDir, subPath, "mcp.json")),
    ];

    const appSupportPaths = (appName: string) => [
        join("Library", "Application Support", appName, "User"), // macOS
        join("AppData", "Roaming", appName, "User"), // Windows
    ];

    return {
        kiro: createPaths("kiro", [join(".kiro", "settings")]),
        antigravity: createPaths("antigravity", appSupportPaths("Antigravity")),
        cursor: createPaths("cursor", appSupportPaths("Cursor")),
        windsurf: createPaths("windsurf", appSupportPaths("Windsurf")),
        "claude-code": [
            ...createPaths("claude"),
            ...(getClaudeManagedMcpPath() ? [getClaudeManagedMcpPath()!] : []),
        ],
        vscode: createPaths("vscode", appSupportPaths("Code")),
        cline: createPaths("cline", appSupportPaths("Cline")),
    };
}

/**
 * Get enterprise/global MCP config paths (not user-specific)
 * These are system-wide managed configurations
 */
export function getGlobalMcpConfigPaths(): Record<string, string[]> {
    const platform = mapOS();

    switch (platform) {
        case "macos":
            return {
                cursor: ["/Library/Application Support/Cursor/mcp.json"],
                "claude-code": [
                    "/Library/Application Support/ClaudeCode/managed-mcp.json",
                ],
            };
        case "windows":
            return {
                cursor: ["C:\\ProgramData\\Cursor\\mcp.json"],
                "claude-code": ["C:\\Program Files\\ClaudeCode\\managed-mcp.json"],
            };
        default:
            return {};
    }
}
