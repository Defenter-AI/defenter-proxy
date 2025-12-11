import { IUvRunner, UvCommand } from "./types";
import { getUvCommand } from "./utils";

/**
 * Simple UvRunner for targets where uvx is pre-installed
 * (e.g., claude-code-plugin where SessionStart hook handles setup,
 * or jamf where shell script handles setup)
 */
export class SimpleUvRunner implements IUvRunner {
    private readonly version: string;

    constructor(version: string) {
        this.version = version;
    }

    async initialize(): Promise<void> {
        // No initialization needed - uvx setup handled externally
    }

    getCommand(): UvCommand {
        return getUvCommand(this.version);
    }
}
