import { basename, dirname, join, normalize } from "path";
import { promises as fs } from "fs";
import {
    ClaudeCodeHooksConfig,
    ClaudeCodeSettingsConfig,
    CursorHooksConfig,
} from "./types";
import {
    fileExists,
    mapOS,
    parseJsonc,
    samePath,
    updateJsoncFile,
} from "@defenter/common-ts/utils";
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

                await updateJsoncFile(hooksFilePath, (config: CursorHooksConfig) => {
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
            await updateJsoncFile(hooksFilePath, (config: CursorHooksConfig) => {
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

/**
 * Claude Code hooks monitor
 * Manages Claude Code's settings.json hooks section registration and monitoring
 */
export class ClaudeCodeHooksMonitor {
    private readonly hooksJsonPath: string;
    private readonly errorHandler: IErrorHandler;
    private readonly logger: ILogger;
    private fileWatcher: FileWatcher;
    private isMonitoring: boolean = false;
    private cachedHooksConfig: ClaudeCodeHooksConfig | undefined;

    constructor(hooksJsonPath: string, errorHandler: IErrorHandler, logger: ILogger) {
        this.hooksJsonPath = hooksJsonPath;
        this.errorHandler = errorHandler;
        this.logger = logger;

        this.fileWatcher = new FileWatcher({
            onFileProcess: async (filePath: string) => {
                this.logger.info(
                    `Claude Code Hooks: ${filePath} changed, re-registering hooks`
                );
                await this.registerHooks(filePath);
            },
            onFileDelete: async (filePath: string) => {
                this.logger.info(
                    `Claude Code Hooks: ${filePath} deleted, recreating with hooks`
                );
                await this.registerHooks(filePath);
            },
            logger: this.logger,
        });
    }

    /**
     * Start monitoring Claude Code settings.json files
     * @param settingsFilePaths Array of settings file paths to monitor
     */
    async startMonitoring(settingsFilePaths: string[]): Promise<void> {
        if (this.isMonitoring) {
            this.logger.debug("Claude Code Hooks: already monitoring");
            return;
        }

        this.logger.info(
            `Claude Code Hooks: Starting monitoring for ${settingsFilePaths.length} settings file(s)`
        );

        const watchable: string[] = [];
        for (const settingsPath of settingsFilePaths) {
            this.logger.info(`Claude Code Hooks: Processing ${settingsPath}`);
            try {
                await this.registerHooks(settingsPath);
                watchable.push(settingsPath);
            } catch (error) {
                // per-file failure must not stop monitoring other settings files
                this.logger.error(
                    `Claude Code Hooks: Failed to process ${settingsPath}`,
                    error
                );
            }
        }

        try {
            if (!watchable.length) {
                throw new Error(
                    "Claude Code Hooks: No settings files could be processed"
                );
            }

            this.isMonitoring = true;
            await this.fileWatcher.startWatching(watchable);
            this.logger.info("Claude Code Hooks: Monitoring started successfully");
        } catch (error) {
            this.logger.error(
                "Claude Code Hooks: Failed to start hooks monitoring",
                error
            );
            await this.stopMonitoring();
        }
    }

    async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.logger.info("Claude Code Hooks: Stopping hooks monitoring");

        await this.fileWatcher.stopWatching();
        this.fileWatcher.cleanupAllState();

        this.isMonitoring = false;
        this.logger.info("Claude Code Hooks: Hooks monitoring stopped");
    }

    /**
     * Unregister hooks from specific settings files
     */
    async unregisterHook(settingsFilePaths: string[]): Promise<void> {
        const hooksConfig = await this.getHooksConfig();
        if (!hooksConfig) {
            return;
        }

        for (const settingsPath of settingsFilePaths) {
            try {
                if (!(await fileExists(settingsPath))) {
                    continue;
                }

                await updateJsoncFile(
                    settingsPath,
                    (config: ClaudeCodeSettingsConfig) => {
                        if (!config.hooks) {
                            return config;
                        }

                        for (const hookName of Object.keys(hooksConfig.hooks)) {
                            if (!config.hooks[hookName]) {
                                continue;
                            }

                            config.hooks[hookName] = config.hooks[hookName].filter(
                                entry => !this.isDefenterHookEntry(entry)
                            );

                            if (!config.hooks[hookName].length) {
                                delete config.hooks[hookName];
                            }
                        }

                        if (Object.keys(config.hooks).length === 0) {
                            delete config.hooks;
                        }

                        return config;
                    }
                );

                this.fileWatcher.recordWrite(settingsPath);

                this.logger.info(
                    `Claude Code Hooks: Unregistered hooks from ${settingsPath}`
                );
            } catch (error) {
                this.logger.error(
                    `Claude Code Hooks: Failed to unregister hook from ${settingsPath}`,
                    error
                );
            }
        }
    }

    private isDefenterHookEntry(entry: any): boolean {
        return entry.hooks?.some(
            (h: any) =>
                h.type === "command" &&
                (h.command?.includes("defenter-proxy") ||
                    h.command?.includes("launcher.js"))
        );
    }

    private async getHooksConfig(): Promise<ClaudeCodeHooksConfig | undefined> {
        if (this.cachedHooksConfig) {
            return this.cachedHooksConfig;
        }

        try {
            if (!(await fileExists(this.hooksJsonPath))) {
                this.logger.error(
                    `Claude Code Hooks: hooks.json not found at ${this.hooksJsonPath}`
                );
                return undefined;
            }

            const content = await fs.readFile(this.hooksJsonPath, "utf8");
            this.cachedHooksConfig = parseJsonc(content) as ClaudeCodeHooksConfig;
            return this.cachedHooksConfig;
        } catch (error) {
            this.logger.error("Claude Code Hooks: Failed to read hooks.json", error);
            return undefined;
        }
    }

    private async registerHooks(settingsPath: string): Promise<void> {
        const hooksConfig = await this.getHooksConfig();
        if (!hooksConfig) {
            return;
        }

        try {
            await fs.mkdir(dirname(settingsPath), { recursive: true });
        } catch {
            // best-effort; writing may still fail later
        }

        try {
            await updateJsoncFile(settingsPath, (config: ClaudeCodeSettingsConfig) => {
                if (!config.hooks) {
                    config.hooks = {};
                }

                for (const [hookName, hookEntries] of Object.entries(hooksConfig.hooks)) {
                    const existingEntries = config.hooks[hookName] || [];

                    // Remove stale defenter entries
                    const cleaned = existingEntries.filter(
                        entry => !this.isDefenterHookEntry(entry)
                    );

                    // Add our hook entries
                    config.hooks[hookName] = [...cleaned, ...hookEntries];
                }

                return config;
            });

            this.fileWatcher.recordWrite(settingsPath);

            this.logger.info(`Claude Code Hooks: Registered hooks in ${settingsPath}`);
        } catch (error) {
            this.logger.error(
                `Claude Code Hooks: Failed to register hooks in ${settingsPath}`,
                error
            );
            throw error;
        }
    }
}
