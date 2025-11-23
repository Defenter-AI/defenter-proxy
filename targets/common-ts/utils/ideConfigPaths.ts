import { join } from "path";

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
        claude: createPaths("claude", [
            join("Library", "Application Support", "Claude"), // macOS (no User subdir)
            join("AppData", "Roaming", "Claude"), // Windows (no User subdir)
        ]),
        vscode: createPaths("vscode", appSupportPaths("Code")),
        cline: createPaths("cline", appSupportPaths("Cline")),
    };
}

