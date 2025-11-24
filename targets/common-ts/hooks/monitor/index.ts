import { basename, dirname, join, normalize } from "path";
import { promises as fs } from "fs";
import { HooksConfig } from "./types";
import { fileExists, mapOS, samePath, updateJsoncFile } from "@defenter/common-ts/utils";
import { FileWatcher } from "@defenter/common-ts/watcher";
import { IErrorHandler, ILogger } from "@defenter/common-ts/types";

/**
 * Cursor hooks monitor
 * Manages Cursor's hooks.json file registration and monitoring
 */
export class CursorHooksMonitor {
    private readonly extensionPath: string;
    private readonly errorHandler: IErrorHandler;
    private readonly logger: ILogger;
    private fileWatcher: FileWatcher;
    private isMonitoring: boolean = false;

    constructor(extensionPath: string, errorHandler: IErrorHandler, logger: ILogger) {
        this.extensionPath = extensionPath;
        this.errorHandler = errorHandler;
        this.logger = logger;

        // Create file watcher with callbacks
        this.fileWatcher = new FileWatcher({
            onFileProcess: async (filePath: string) => {
                // Process hook registration whenever file changes
                this.logger.info(
                    `Cursor Hooks: ${filePath} changed, re-registering hooks`
                );
                await this.registerHooks(filePath);
            },
            onFileDelete: async (filePath: string) => {
                // Recreate file when deleted (auto-registration)
                this.logger.info(
                    `Cursor Hooks: ${filePath} deleted, recreating with hooks`
                );
                await this.registerHooks(filePath);
            },
            logger: this.logger,
        });
    }

    /**
     * Start monitoring Cursor's hooks.json files
     * @param hooksFilePaths Array of hooks file paths to monitor
     */
    async startMonitoring(hooksFilePaths: string[]): Promise<void> {
        if (this.isMonitoring) {
            this.logger.debug("Cursor Hooks: already monitoring");
            return;
        }

        this.isMonitoring = true;

        try {
            this.logger.info(
                `Cursor Hooks: Starting monitoring for ${hooksFilePaths.length} hooks file(s)`
            );

            for (const hooksFilePath of hooksFilePaths) {
                this.logger.info(`Cursor Hooks: Processing ${hooksFilePath}`);
                await this.registerHooks(hooksFilePath);
            }

            // Start watching all hooks files for changes
            await this.fileWatcher.startWatching(hooksFilePaths);

            this.logger.info("Cursor Hooks: Monitoring started successfully");
        } catch (error) {
            this.logger.error("Cursor Hooks: Failed to start hooks monitoring", error);
            await this.stopMonitoring();
        }
    }

    /**
     * Stop monitoring and cleanup
     */
    async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.logger.info("Cursor Hooks: Stopping hooks monitoring");

        await this.fileWatcher.stopWatching();
        this.fileWatcher.cleanupAllState();

        this.isMonitoring = false;
        this.logger.info("Cursor Hooks: Hooks monitoring stopped");
    }

    /**
     * Unregister hooks from specific hooks files (called on extension uninstall)
     * @param hooksFilePaths Array of hooks file paths to unregister from
     */
    async unregisterHook(hooksFilePaths: string[]): Promise<void> {
        for (const hooksFilePath of hooksFilePaths) {
            try {
                if (!(await fileExists(hooksFilePath))) {
                    continue;
                }

                const scriptsMap = await this.getScriptsMap();

                await updateJsoncFile(hooksFilePath, (config: HooksConfig) => {
                    for (const [
                        hookName,
                        { path: scriptPath, name: scriptName },
                    ] of Object.entries(scriptsMap)) {
                        if (!config.hooks?.[hookName]) {
                            continue;
                        }

                        // Remove hooks that match our script name
                        // (handles both quoted and unquoted paths)
                        config.hooks[hookName] = config.hooks[hookName].filter(
                            hook =>
                                basename(this.normalizeCommandPath(hook.command)) !==
                                scriptName
                        );

                        // Clean up empty arrays
                        if (!config.hooks[hookName].length) {
                            delete config.hooks[hookName];
                        }
                    }

                    return config;
                });

                // Record write to prevent processing loop (if watcher is still active)
                this.fileWatcher.recordWrite(hooksFilePath);

                this.logger.info(
                    `Cursor Hooks: Unregistered hooks from ${hooksFilePath}`
                );
            } catch (error) {
                this.logger.error(
                    `Cursor Hooks: Failed to unregister hook from ${hooksFilePath}`,
                    error
                );
            }
        }
    }

    /**
     * Normalize command path by removing quotes and normalizing path separators
     */
    private normalizeCommandPath(command: string): string {
        const unquoted = command.replace(/^"(.*)"$/, "$1");
        return normalize(unquoted);
    }

    private async getHookScriptPath(scriptName: string): Promise<string> {
        // During uninstall, extensionPath may be undefined - return placeholder path
        if (!this.extensionPath) {
            return scriptName; // Only the name is needed for unregistration
        }

        const scriptPath = join(
            this.extensionPath,
            "scripts",
            "cursor",
            "hooks",
            scriptName
        );
        // Make script executable (Unix-like systems)
        if ((await fileExists(scriptPath)) && mapOS() !== "windows") {
            await fs.chmod(scriptPath, 0o755);
        }
        return scriptPath;
    }

    private getScriptsMap = async (): Promise<
        Record<string, { path: string; name: string }>
    > => {
        const consolidatedScriptName = `defenter-cursor-hook.${mapOS() === "windows" ? "bat" : "sh"}`;
        const consolidatedScriptPath =
            await this.getHookScriptPath(consolidatedScriptName);

        // All hooks use the same consolidated script
        // The hook_event_name in the input will determine routing
        return {
            beforeShellExecution: {
                path: consolidatedScriptPath,
                name: consolidatedScriptName,
            },
            afterShellExecution: {
                path: consolidatedScriptPath,
                name: consolidatedScriptName,
            },
            beforeReadFile: {
                path: consolidatedScriptPath,
                name: consolidatedScriptName,
            },
            beforeSubmitPrompt: {
                path: consolidatedScriptPath,
                name: consolidatedScriptName,
            },
        };
    };

    /**
     * Register Cursor hooks in a specific hooks.json file
     */
    private async registerHooks(hooksFilePath: string): Promise<void> {
        await fs.mkdir(dirname(hooksFilePath), { recursive: true });
        const scriptsMap = await this.getScriptsMap();

        try {
            // Update hooks.json while preserving comments
            await updateJsoncFile(hooksFilePath, (config: HooksConfig) => {
                // Ensure proper structure exists
                if (!config.version) {
                    config.version = 1;
                }
                if (!config.hooks) {
                    config.hooks = {};
                }

                for (const [
                    hookName,
                    { path: scriptPath, name: scriptName },
                ] of Object.entries(scriptsMap)) {
                    const existingHooks = config.hooks[hookName] || [];

                    // Clean stale entries by script name (handles version upgrades)
                    const cleaned = existingHooks.filter(
                        hook =>
                            basename(this.normalizeCommandPath(hook.command)) !==
                            scriptName
                    );

                    // Check if same full path is already there (handles quoted/unquoted)
                    const hookExists = cleaned.some(hook =>
                        samePath(this.normalizeCommandPath(hook.command), scriptPath)
                    );

                    if (hookExists) {
                        this.logger.debug(
                            `Cursor Hooks: ${hookName} hook already registered`
                        );
                        config.hooks[hookName] = cleaned;
                    } else {
                        config.hooks[hookName] = [
                            ...cleaned,
                            { command: this.protectCommandPath(scriptPath) },
                        ];
                    }
                }

                return config;
            });

            // Record write to prevent processing loop
            this.fileWatcher.recordWrite(hooksFilePath);

            this.logger.info(
                `Cursor Hooks: Registered ${Object.keys(scriptsMap).join(", ")} in ${hooksFilePath}`
            );
        } catch (error) {
            this.logger.error(
                `Cursor Hooks: Failed to register hooks in ${hooksFilePath}`,
                error
            );
            throw error;
        }
    }

    private protectCommandPath(scriptPath: string) {
        // Quote path on Windows if it contains spaces
        return mapOS() === "windows" && scriptPath.includes(" ")
            ? `"${scriptPath}"`
            : scriptPath;
    }
}
