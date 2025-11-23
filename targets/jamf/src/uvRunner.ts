import { IUvRunner, UvCommand } from "@defenter/common-ts/types";
import { getUvCommand } from "@defenter/common-ts/utils";

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
        return getUvCommand(this.version);
    }
}
