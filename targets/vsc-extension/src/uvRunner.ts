import type { ExtensionContext } from "vscode";
import { join } from "path";
import log from "./log";
import { getCurrentExtensionVersion } from "./utils";
import { IUvRunner, UvCommand } from "@defenter/common-ts/types";
import { ensureUvxReady, getUvCommand } from "@defenter/common-ts/uv";

export class UvRunner implements IUvRunner {
    private context: ExtensionContext;
    private uvxCommand: string | undefined;
    private version: string;

    constructor(context: ExtensionContext) {
        this.context = context;
        this.version = getCurrentExtensionVersion(context);
    }

    async initialize(cleanCache: boolean = false): Promise<void> {
        if (this.uvxCommand) {
            return;
        }

        const scriptsDir = join(this.context.extensionPath, "scripts");
        this.uvxCommand = await ensureUvxReady({
            scriptsDir,
            version: this.version,
            logger: log,
            cleanCache,
        });

        log.info(`uvx ready: ${this.uvxCommand}`);
    }

    getCommand(): UvCommand {
        if (!this.uvxCommand) {
            throw new Error("uvx command not available; initialize() first");
        }

        return getUvCommand(this.version, this.uvxCommand);
    }
}
