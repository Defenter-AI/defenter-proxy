import { promises as fs } from "fs";
import { join, resolve } from "path";
import { listIdeUsers, mapOS } from "./index";
import { OSUser } from "../types";
import { homedir } from "os";

/**
 * List all users who have Cursor installed
 */
export async function listCursorUsers(): Promise<OSUser[]> {
    return listIdeUsers(".cursor");
}

/**
 * Get the global/enterprise hooks file path for Cursor
 */
export function getCursorGlobalHooksPath(): string | undefined {
    const platform = mapOS();
    switch (platform) {
        case "macos":
            return "/Library/Application Support/Cursor/hooks.json";
        case "windows":
            return "C:\\ProgramData\\Cursor\\hooks.json";
        default:
            return undefined;
    }
}

export function getCursorUserHooksPath(): string {
    return join(homedir(), ".cursor", "hooks.json");
}

export function buildCursorHooksInitInput(workspaceRoots: string[]): string {
    const nowId = `${Date.now()}`.slice(-8);
    return JSON.stringify({
        conversation_id: nowId,
        generation_id: nowId,
        hook_event_name: "init",
        workspace_roots: workspaceRoots,
    });
}

/**
 * Parse Cursor's workspace storage to discover all workspaces
 * Works on macOS by reading Cursor's storage files
 * @param userHomeDir Optional user home directory. Defaults to current user's home.
 */
export async function parseCursorWorkspaces(userHomeDir?: string): Promise<string[]> {
    const workspaces = new Set<string>();
    const homeDirectory = userHomeDir || homedir();

    const platform = mapOS();
    switch (platform) {
        case "macos": {
            try {
                // Parse globalStorage/storage.json
                const storagePath = join(
                    homeDirectory,
                    "Library",
                    "Application Support",
                    "Cursor",
                    "User",
                    "globalStorage",
                    "storage.json"
                );

                try {
                    const storageContent = await fs.readFile(storagePath, "utf8");
                    const storage = JSON.parse(storageContent);

                    if (storage.profileAssociations?.workspaces) {
                        for (const uri of Object.keys(
                            storage.profileAssociations.workspaces
                        )) {
                            // Remove file:// prefix
                            const path = uri.replace(/^file:\/\//, "");
                            if (path) {
                                workspaces.add(resolve(path));
                            }
                        }
                    }
                } catch (error) {
                    // storage.json not found or invalid - skip
                }

                // Parse workspaceStorage/*/workspace.json files
                const workspaceStorageDir = join(
                    homeDirectory,
                    "Library",
                    "Application Support",
                    "Cursor",
                    "User",
                    "workspaceStorage"
                );

                try {
                    const entries = await fs.readdir(workspaceStorageDir);

                    for (const entry of entries) {
                        try {
                            const workspaceJsonPath = join(
                                workspaceStorageDir,
                                entry,
                                "workspace.json"
                            );
                            const workspaceContent = await fs.readFile(
                                workspaceJsonPath,
                                "utf8"
                            );
                            const workspace = JSON.parse(workspaceContent);

                            if (workspace.folder) {
                                // Remove file:// prefix
                                const path = workspace.folder.replace(/^file:\/\//, "");
                                if (path) {
                                    workspaces.add(resolve(path));
                                }
                            }
                        } catch {
                            // Skip invalid workspace.json files
                        }
                    }
                } catch (error) {
                    // workspaceStorage directory isn't found - skip
                }
            } catch (error) {
                // Cursor isn't installed or storage not accessible - return an empty array
            }
            break;
        }
        default:
            console.warn(`parseCursorWorkspaces: Unsupported platform: ${platform}`);
    }

    return Array.from(workspaces);
}
