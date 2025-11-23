import { basename, dirname, join, normalize } from "path";
import { promises as fs } from "fs";
import { homedir } from "os";
import { spawn } from "child_process";
import { HooksConfig } from "./types";
import { fileExists, mapOS, samePath, updateJsoncFile } from "@defenter/common-ts/utils";
import { FileWatcher } from "@defenter/common-ts/watcher";
import { IErrorHandler, IUvRunner, ILogger } from "@defenter/common-ts/types";

/**
 * Cursor hooks monitor
 * Manages Cursor's hooks.json file registration and monitoring
 */
export class CursorHooksMonitor {
    private readonly hooksFilePath: string;
    private readonly extensionPath: string;
    private readonly errorHandler: IErrorHandler;
    private readonly logger: ILogger;
    private fileWatcher: FileWatcher;
    private isMonitoring: boolean = false;

    constructor(hooksFilePath: string | undefined, extensionPath: string, errorHandler: IErrorHandler, logger: ILogger) {
        this.hooksFilePath = hooksFilePath || join(homedir(), ".cursor", "hooks.json");
        this.extensionPath = extensionPath;
        this.errorHandler = errorHandler;
        this.logger = logger;

        // Create file watcher with callbacks
        this.fileWatcher = new FileWatcher({
            onFileProcess: async (filePath: string) => {
                // Process hook registration whenever file changes
                this.logger.info("Cursor Hooks: hooks.json changed, re-registering hooks");
                await this.registerHooks();
            },
            onFileDelete: async (filePath: string) => {
                // Recreate file when deleted (auto-registration)
                this.logger.info("Cursor Hooks: hooks.json deleted, recreating with hooks");
                await this.registerHooks();
            },
            logger: this.logger,
        });
    }

    /**
     * Start monitoring Cursor's hooks.json file
     */
    async startMonitoring(uvRunner: IUvRunner, workspaceRoots: string[]): Promise<void> {
        if (this.isMonitoring) {
            this.logger.debug(`Cursor Hooks: already monitoring ${this.hooksFilePath}`);
            return;
        }

        this.isMonitoring = true;

        try {
            this.logger.info(`Cursor Hooks: Starting ${this.hooksFilePath} monitoring`);

            // Initialize Cursor's "hooks MCP"
            await this.initializeHooks(uvRunner, workspaceRoots);

            // Register hooks initially
            await this.registerHooks();

            // Start watching the hooks file for changes
            await this.fileWatcher.startWatching([this.hooksFilePath]);
        } catch (error) {
            this.logger.error("Cursor Hooks: Failed to start hooks monitoring", error);
            await this.stopMonitoring();
        }
    }

    /**
     * Initialize Cursor hooks with security API (call init handler)
     */
    private async initializeHooks(uvRunner: IUvRunner, workspaceRoots: string[]): Promise<void> {
        try {
            this.logger.info("Cursor Hooks: Initializing hooks with security API");

            const uvCommand = uvRunner.getCommand();
            const args = [...uvCommand.args, "--ide-tool", "--ide", "cursor"];

            return new Promise((resolve, reject) => {
                const proc = spawn(uvCommand.executable, args, {
                    stdio: "pipe",
                    shell: false,
                });

                // Send common schema input via stdin immediately after spawn
                if (proc.stdin) {
                    try {
                        const input = JSON.stringify({
                            conversation_id: `${Date.now()}`.slice(-8),
                            generation_id: `${Date.now()}`.slice(-8),
                            hook_event_name: "init",
                            workspace_roots: workspaceRoots,
                        });
                        proc.stdin.write(input);
                        proc.stdin.end();
                    } catch (error) {
                        this.logger.error(
                            "Cursor Hooks: Failed to write to init handler stdin",
                            error
                        );
                    }
                }

                let stdout = "";
                let stderr = "";

                proc.stdout?.on("data", data => {
                    stdout += data.toString();
                });

                proc.stderr?.on("data", data => {
                    stderr += data.toString();
                });

                proc.on("close", code => {
                    if (code === 0) {
                        this.logger.info("Cursor Hooks: Init handler completed successfully");
                        if (stdout) {
                            this.logger.debug(`Init handler output: ${stdout}`);
                        }
                        resolve();
                    } else {
                        this.logger.error(
                            `Cursor Hooks: Init handler failed with exit code ${code}`
                        );
                        if (stderr) {
                            this.logger.error(`Init handler stderr: ${stderr}`);
                        }
                        // Don't reject - allow monitoring to continue even if init fails
                        resolve();
                    }
                });

                proc.on("error", error => {
                    this.logger.error("Cursor Hooks: Failed to spawn init handler", error);
                    // Don't reject - allow monitoring to continue even if init fails
                    resolve();
                });
            });
        } catch (error) {
            this.logger.error("Cursor Hooks: Failed to initialize hooks", error);
            // Don't fail the entire monitoring if init fails
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
     * Unregister hook from Cursor's hooks.json (called on extension uninstall)
     */
    async unregisterHook(): Promise<void> {
        try {
            if (!(await fileExists(this.hooksFilePath))) {
                return;
            }

            const scriptsMap = await this.getScriptsMap();

            await updateJsoncFile(this.hooksFilePath, (config: HooksConfig) => {
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
            this.fileWatcher.recordWrite(this.hooksFilePath);

            this.logger.info("Cursor Hooks: Unregistered hooks");
        } catch (error) {
            this.logger.error("Cursor Hooks: Failed to unregister hook", error);
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
     * Register Cursor hooks immediately (used during startup)
     */
    public async registerHooks(): Promise<void> {
        await fs.mkdir(dirname(this.hooksFilePath), { recursive: true });
        const scriptsMap = await this.getScriptsMap();

        try {
            // Update hooks.json while preserving comments
            await updateJsoncFile(this.hooksFilePath, (config: HooksConfig) => {
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
                        this.logger.debug(`Cursor Hooks: ${hookName} hook already registered`);
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
            this.fileWatcher.recordWrite(this.hooksFilePath);

            this.logger.info(
                `Cursor Hooks: Registered ${Object.keys(scriptsMap).join(", ")} in ${this.hooksFilePath}`
            );
        } catch (error) {
            this.logger.error("Cursor Hooks: Failed to register hooks", error);
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
