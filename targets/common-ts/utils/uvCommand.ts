import { UvCommand } from "../types";

/**
 * Get UV command with local development path support
 * If DEFENTER_LOCAL_PROXY_PATH is set, uses local proxy for development
 */
export function getUvCommand(version: string, uvxExecutable = "uvx"): UvCommand {
    // Support DEFENTER_LOCAL_PROXY_PATH for local development
    if (process.env.DEFENTER_LOCAL_PROXY_PATH) {
        return {
            executable: "uv",
            args: [
                "run",
                "--directory",
                process.env.DEFENTER_LOCAL_PROXY_PATH,
                "defenter-proxy",
            ],
        };
    }

    return {
        executable: uvxExecutable,
        args: [`defenter-proxy==${version}`],
    };
}

