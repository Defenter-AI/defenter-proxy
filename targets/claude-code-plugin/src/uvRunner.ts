import type { IUvRunner, UvCommand } from "@defenter/common-ts/types";
import { getUvCommand } from "@defenter/common-ts/uv";
import { VERSION } from "./version";

export class ClaudeCodeUvRunner implements IUvRunner {
    private readonly uvxExecutable: string;

    constructor() {
        this.uvxExecutable = process.env.DEFENTER_UVX_EXECUTABLE ?? "uvx";
    }

    async initialize(): Promise<void> {
        // no-op
    }

    getCommand(): UvCommand {
        return getUvCommand(VERSION, this.uvxExecutable);
    }
}
