import { join } from "path";
import { ensureUvxReady as ensureUvxReadyCommon } from "@defenter/common-ts/uv";
import type { ClaudeCodeLogger } from "./logger";
import { getClaudePluginRoot } from "./paths";

export async function ensureUvxReady(
    logger: ClaudeCodeLogger,
    version: string
): Promise<string> {
    const pluginRoot = getClaudePluginRoot();
    const scriptsDir = join(pluginRoot, "scripts");
    return await ensureUvxReadyCommon({ scriptsDir, version, logger });
}
