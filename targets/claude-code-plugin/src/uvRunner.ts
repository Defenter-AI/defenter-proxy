import { IUvRunner, UvCommand } from "@defenter/common-ts/types";
import { getUvCommand } from "@defenter/common-ts/utils";
import { VERSION } from "./version";

export class ClaudeCodeUvRunner implements IUvRunner {
    async initialize(): Promise<void> {
        // No initialization needed - uvx setup is handled by SessionStart hook
    }

    getCommand(): UvCommand {
        return getUvCommand(VERSION);
    }
}
