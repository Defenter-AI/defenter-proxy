import { IUvRunner, UvCommand } from "@defenter/common-ts/types";

/**
 * UvRunner for jamf; Setup script already ran, so just returns the command
 */
export class JamfUvRunner implements IUvRunner {
    private readonly version: string;

    constructor(version: string) {
        this.version = version;
    }

    async initialize(): Promise<void> {
        // Setup script already ran
    }

    getCommand(): UvCommand {
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
            executable: "uvx",
            args: [`defenter-proxy==${this.version}`],
        };
    }
}
