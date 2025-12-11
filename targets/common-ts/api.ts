import { getApiUrl, getUserUid, mapOS } from "./utils";

/**
 * Report lifecycle event to backend API
 * Fails silently on any error
 *
 * @param state - Lifecycle state: install, update, uninstall, heartbeat
 * @param client - Client identifier (e.g., "cursor", "vscode", "claude-code")
 * @param version - Client version string
 */
export async function reportLifecycleEvent(
    state: string,
    client: string,
    version: string
): Promise<void> {
    try {
        const userUid = await getUserUid();
        if (!userUid) {
            console.debug("Lifecycle event skipped: user UID not found");
            return;
        }

        const apiUrl = await getApiUrl();
        if (!apiUrl) {
            console.debug("Lifecycle event skipped: API URL not found");
            return;
        }

        const payload = {
            state,
            version,
            client,
            os: mapOS(),
        };

        const response = await fetch(`${apiUrl}/client-state`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-UID": userUid,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.debug(`Lifecycle event failed: HTTP ${response.status}`);
            return;
        }

        console.debug(`Lifecycle event reported: ${state}`);
    } catch (error) {
        console.debug(`Lifecycle event error: ${error}`);
    }
}
