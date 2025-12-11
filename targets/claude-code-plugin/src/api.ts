import { reportLifecycleEvent as reportLifecycleEventCommon } from "@defenter/common-ts/api";
import { VERSION } from "./version";

/**
 * Report lifecycle event for claude-code plugin
 */
export async function reportLifecycleEvent(state: string): Promise<void> {
    return reportLifecycleEventCommon(state, "claude-code", VERSION);
}
