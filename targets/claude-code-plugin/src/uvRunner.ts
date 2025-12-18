import type { IUvRunner, UvCommand } from "@defenter/common-ts/types";
import { getUvCommand } from "@defenter/common-ts/uv";
import { ClaudeCodeLogger } from "./logger";
import { ensureUvxReady } from "./uvx";
import { VERSION } from "./version";

export class ClaudeCodeUvRunner implements IUvRunner {
    private uvxExecutable: string | undefined;

    async initialize(): Promise<void> {
        if (process.env.DEFENTER_LOCAL_PROXY_PATH) {
            return;
        }
        if (this.uvxExecutable) {
            return;
        }
        this.uvxExecutable = await ensureUvxReady(new ClaudeCodeLogger(), VERSION);
    }

    getCommand(): UvCommand {
        return getUvCommand(VERSION, this.uvxExecutable ?? "uvx");
    }
}
