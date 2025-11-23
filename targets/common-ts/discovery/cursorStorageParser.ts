import { promises as fs } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

/**
 * Parse Cursor's workspace storage to discover all workspaces
 * Works on macOS by reading Cursor's storage files
 */
export async function parseCursorWorkspaces(): Promise<string[]> {
    const workspaces = new Set<string>();

    try {
        // Parse globalStorage/storage.json
        const storagePath = join(
            homedir(),
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

            // Extract from profileAssociations.workspaces
            if (storage.profileAssociations?.workspaces) {
                for (const uri of Object.keys(storage.profileAssociations.workspaces)) {
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
            homedir(),
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
                    const workspaceContent = await fs.readFile(workspaceJsonPath, "utf8");
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
            // workspaceStorage directory not found - skip
        }
    } catch (error) {
        // Cursor not installed or storage not accessible - return empty array
    }

    return Array.from(workspaces);
}

