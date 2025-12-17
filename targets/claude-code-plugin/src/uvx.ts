import { join } from "path";
import { ensureUvxReady as ensureUvxReadyCommon } from "@defenter/common-ts/uv";
import type { ClaudeCodeLogger } from "./logger";

export async function ensureUvxReady(
    logger: ClaudeCodeLogger,
    version: string
): Promise<string> {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? join(__dirname, "..");
    const scriptsDir = join(pluginRoot, "scripts");
    return await ensureUvxReadyCommon({ scriptsDir, version, logger });
}
