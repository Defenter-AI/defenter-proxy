import { SimpleUvRunner } from "@defenter/common-ts/uvRunner";
import { VERSION } from "./version";

export class ClaudeCodeUvRunner extends SimpleUvRunner {
    constructor() {
        super(VERSION);
    }
}
