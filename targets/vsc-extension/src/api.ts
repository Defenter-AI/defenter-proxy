import { reportLifecycleEvent as reportLifecycleEventCommon } from "@defenter/common-ts/api";
import { detectIDEFromScriptPath, getVersion } from "./utils";
import log from "./log";

/**
 * Report lifecycle event for vsc-extension
 */
export async function reportLifecycleEvent(state: string): Promise<void> {
    const version = getVersion();
    if (!version) {
        log.debug("Lifecycle event skipped: could not determine version");
        return;
    }

    const client = detectIDEFromScriptPath();
    if (!client) {
        log.debug("Lifecycle event skipped: could not detect client");
        return;
    }

    return reportLifecycleEventCommon(state, client, version);
}
