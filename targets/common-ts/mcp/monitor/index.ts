import { basename, dirname, join, normalize, resolve } from "path";
import { promises as fs } from "fs";
import { homedir } from "os";
import { createHash } from "crypto";
import { applyEdits, modify, parseTree, findNodeAtLocation } from "jsonc-parser";
import {
    fileExists,
    getIdeSystemConfigPaths,
    isRemoteUrl,
    parseJsonc,
    writeFile,
} from "@defenter/common-ts/utils";
import { FileWatcher } from "@defenter/common-ts/watcher";
import {
    IConfigDiscoverer,
    IErrorHandler,
    ILogger,
    IUvRunner,
    MCPConfig,
    MCPServerConfig,
} from "@defenter/common-ts/types";

export class ConfigurationMonitor {
    private uvRunner: IUvRunner | undefined;
    private discoverer: IConfigDiscoverer | undefined;
    private errorHandler: IErrorHandler;
    private logger: ILogger;
    private fileWatcher: FileWatcher;
    private isMonitoring: boolean = false;
    private readonly currentIDE: string | undefined;

    constructor(errorHandler: IErrorHandler, logger: ILogger, currentIDE?: string) {
        this.errorHandler = errorHandler;
        this.logger = logger;
        this.currentIDE = currentIDE;

        // Create file watcher with callbacks
        this.fileWatcher = new FileWatcher({
            onFileProcess: async (filePath: string) => {
                await this.processConfigurationFile(filePath);
            },
            onShowError: (message: string) => {
                this.errorHandler.showError(message);
            },
            logger: this.logger,
        });
    }

    /**
     * Get current IDE identifier
     */
    getCurrentIDE(): string | undefined {
        return this.currentIDE;
    }

    /**
     * Get IDE-specific registry directory
     */
    public getMcpsDir = (): string => {
        if (!this.currentIDE) {
            throw new Error("Cannot determine IDE - registry operations not safe");
        }
        return join(homedir(), ".defenter", ".wrapped_mcps", this.currentIDE);
    };

    /**
     * Generate symlink name for registry
     */
    private getSymlinkName(configPath: string): string {
        const normalized = normalize(configPath);
        const hash = createHash("md5").update(normalized).digest("hex").substring(0, 8);
        const basenamePart = basename(normalized, ".json");
        const dirnamePart = basename(dirname(normalized));
        return `${dirnamePart}_${basenamePart}_${hash}.json`;
    }

    /**
     * Add a wrapped file to IDE-specific registry
     */
    private async addWrappedFile(configPath: string): Promise<void> {
        const mcpsDir = this.getMcpsDir();
        const symlinkName = this.getSymlinkName(configPath);
        const symlinkPath = join(mcpsDir, symlinkName);

        try {
            await fs.mkdir(mcpsDir, { recursive: true });
            // Create symlink atomically
            await fs.symlink(configPath, symlinkPath);
        } catch (error: any) {
            if (error.code === "EEXIST") {
                // Symlink already exists - verify it points to same target
                try {
                    const existingTarget = await fs.readlink(symlinkPath);
                    if (resolve(existingTarget) !== resolve(configPath)) {
                        await fs.unlink(symlinkPath);
                        await fs.symlink(configPath, symlinkPath);
                    }
                } catch {
                    // If verification fails, just ignore - symlink exists
                }
            }
            // Non-critical - don't fail if registry update fails
        }
    }

    /**
     * Get wrapped files for CURRENT IDE only
     */
    private async getWrappedFiles(): Promise<string[]> {
        try {
            const mcpsDir = this.getMcpsDir();
            const entries = await fs.readdir(mcpsDir);
            const wrappedFiles: string[] = [];

            for (const entry of entries) {
                try {
                    const symlinkPath = join(mcpsDir, entry);
                    const targetPath = await fs.readlink(symlinkPath);

                    if (await fileExists(targetPath)) {
                        wrappedFiles.push(resolve(targetPath));
                    } else {
                        // Clean up broken symlink
                        await fs.unlink(symlinkPath).catch(() => {}); // Ignore cleanup errors
                    }
                } catch {
                    // Skip invalid entries silently
                }
            }

            return [...new Set(wrappedFiles)]; // Remove duplicates
        } catch {
            // Return empty array for any error
            return [];
        }
    }

    /**
     * Remove wrapped file from registry
     */
    private async removeWrappedFile(configPath: string): Promise<void> {
        try {
            const symlinkPath = join(this.getMcpsDir(), this.getSymlinkName(configPath));
            await fs.unlink(symlinkPath);
        } catch {
            // Ignore errors - file may not exist or already removed
        }
    }

    /**
     * Get all files this IDE instance should unwrap (registry + system paths)
     */
    async getAllWrappedFiles(): Promise<string[]> {
        const allFiles = new Set<string>();

        // 1. Get files from current IDE's registry
        const registryFiles = await this.getWrappedFiles();
        registryFiles.forEach(file => allFiles.add(file));

        // 2. Add system paths for current IDE only
        if (this.currentIDE) {
            const systemPaths = getIdeSystemConfigPaths(homedir());
            const currentIDEPaths = systemPaths[this.currentIDE] || [];

            for (const systemPath of currentIDEPaths) {
                if (await fileExists(systemPath)) {
                    allFiles.add(systemPath);
                }
            }
        }

        return Array.from(allFiles);
    }

    /**
     * Sleep utility for async operations
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Start monitoring MCP configuration files
     */
    async startMonitoring(
        uvRunner: IUvRunner,
        discoverer: IConfigDiscoverer
    ): Promise<void> {
        if (this.isMonitoring) {
            return;
        }

        this.uvRunner = uvRunner;
        this.discoverer = discoverer;
        this.isMonitoring = true;

        try {
            this.logger.info("Starting MCP configuration monitoring...");

            // Discover configuration files
            const configFiles = await discoverer.discoverConfigFiles();

            // Start file watcher
            await this.fileWatcher.startWatching(configFiles);

            // Process existing configuration files on startup with tracking
            for (const configFile of configFiles) {
                const normalizedPath = normalize(resolve(configFile));
                if (!this.fileWatcher.isProcessing(normalizedPath)) {
                    try {
                        await this.processConfigurationFile(configFile);
                    } catch (error) {
                        // per-file failure must not stop monitoring other config files
                        this.logger.error(
                            `Failed to process configuration on startup: ${configFile}`,
                            error
                        );
                    }
                }
            }
        } catch (error) {
            this.logger.error("Failed to start MCP configuration monitoring", error);
            await this.stopMonitoring();
        }
    }

    /**
     * Stop monitoring and cleanup watchers
     */
    async stopMonitoring(): Promise<void> {
        if (!this.isMonitoring) {
            return;
        }

        this.logger.info("Stopping MCP configuration monitoring...");

        await this.fileWatcher.stopWatching();
        this.fileWatcher.cleanupAllState();

        this.isMonitoring = false;
        this.logger.info("Configuration monitoring stopped");
    }

    /**
     * Handle workspace folder changes
     */
    async handleWorkspaceChange(): Promise<void> {
        this.logger.info(
            "Workspace changed - re-establishing MCP configuration monitoring..."
        );

        try {
            // Wait for all processing to complete with timeout
            this.logger.debug("Waiting for all processing to complete...");
            const startTime = Date.now();

            // Wait for fileWatcher to finish processing (checking if any files are being processed)
            await this.sleep(3000);

            // Stop current monitoring
            await this.stopMonitoring();

            // Restart monitoring with new workspace
            if (!this.uvRunner || !this.discoverer) {
                // noinspection ExceptionCaughtLocallyJS
                throw new Error(
                    "UvRunner or discoverer not available for workspace change"
                );
            }
            await this.startMonitoring(this.uvRunner, this.discoverer);

            this.logger.info("Successfully re-established monitoring for new workspace");
        } catch (error) {
            this.logger.error(
                "Failed to re-establish monitoring after workspace change",
                error
            );
            this.errorHandler.showError(
                `Failed to update MCP monitoring for new workspace: ${error}`
            );
        }
    }

    /**
     * Extract raw JSONC string from wrapped server configuration (or backup)
     * Returns the original JSONC string (with comments) for file reconstruction
     */
    private extractRawWrappedConfig(serverConfig: MCPServerConfig): string | undefined {
        if (!this.isAlreadyWrapped(serverConfig)) {
            return undefined; // Not wrapped
        }

        // if a backup key exists - use it as-is
        if (serverConfig.__bak_configs) {
            return serverConfig.__bak_configs;
        }

        // Find --wrapped-config argument
        const wrappedConfigIndex = serverConfig.args?.indexOf("--wrapped-config");
        if (
            wrappedConfigIndex === undefined ||
            wrappedConfigIndex === -1 ||
            !serverConfig.args?.[wrappedConfigIndex + 1]
        ) {
            throw new Error(
                `Invalid wrapped configuration: missing --wrapped-config argument`
            );
        }

        // Return the RAW JSONC string (preserving comments and formatting)
        return serverConfig.args[wrappedConfigIndex + 1];
    }

    /**
     * Convert URL-based MCP config to @mcpower/mcp-remote args array
     */
    private convertUrlConfigToMcpRemoteArgs(
        urlConfig: any,
        serverName: string
    ): string[] {
        const args: string[] = ["-y", "@mcpower/mcp-remote", urlConfig.url];

        if (serverName) {
            args.push("--server-name", serverName);
        }

        // Convert headers to --header flags
        if (!!urlConfig.headers && typeof urlConfig.headers === "object") {
            for (const [key, value] of Object.entries(urlConfig.headers)) {
                args.push("--header", `${key}: ${value}`);
            }
        }

        return args;
    }

    /**
     * Shared helper for JSONC tree-based configuration processing
     * DRY principle: consolidates common file reading, parsing, and writing logic
     */
    private async processConfigurationWithJsoncTree(
        configPath: string,
        processor: (
            content: string,
            config: MCPConfig,
            serverKey: keyof MCPConfig,
            servers: Record<string, MCPServerConfig>
        ) => Promise<{
            modifiedContent: string;
            hasChanges: boolean;
            successMessage: string;
        }>
    ): Promise<boolean> {
        try {
            // Read raw JSONC content
            const content = await fs.readFile(configPath, "utf8");

            // Parse only to detect master key (top level only)
            const config = parseJsonc(content) as MCPConfig;
            const serverKey = this.getMcpServersKey(config);
            if (!serverKey) {
                return false; // No servers to process
            }

            const servers = config[serverKey] || {};

            // Process with the provided function
            const result = await processor(content, config, serverKey, servers);

            // Write modified content if changes were made
            if (result.hasChanges) {
                await writeFile(configPath, result.modifiedContent);
                // Record write to prevent processing loop
                this.fileWatcher.recordWrite(configPath);
                this.logger.info(`${result.successMessage}: ${configPath}`);
            }

            return result.hasChanges;
        } catch (error) {
            this.logger.error(`Failed to process configuration ${configPath}:`, error);
            return false;
        }
    }

    /**
     * Unwrap configuration using JSONC tree manipulation to preserve comments
     */
    async unwrapConfigurationInFile(configPath: string): Promise<boolean> {
        const wasUnwrapped = await this.processConfigurationWithJsoncTree(
            configPath,
            async (content, config, serverKey, servers) => {
                let modifiedContent = content;
                let hasChanges = false;

                // Process each server for unwrapping
                for (const [serverName, serverConfig] of Object.entries(servers)) {
                    // Skip if not wrapped
                    if (!this.isAlreadyWrapped(serverConfig)) {
                        continue;
                    }

                    // Get the raw JSONC from --wrapped-config
                    const rawConfig = this.extractRawWrappedConfig(serverConfig);
                    if (!rawConfig) {
                        this.logger.warn(
                            `Failed to extract raw config for server ${serverName}, skipping`
                        );
                        continue; // Skip this server, keep as-is
                    }

                    // Use direct string replacement to preserve ALL comments
                    try {
                        // Find the wrapped server node in the current content
                        const tree = parseTree(modifiedContent);
                        if (!tree) {
                            continue;
                        }
                        const serverNode = findNodeAtLocation(tree, [
                            serverKey,
                            serverName,
                        ]);
                        if (
                            !serverNode ||
                            serverNode.offset === undefined ||
                            serverNode.length === undefined
                        ) {
                            continue;
                        }

                        // Replace wrapped server with raw JSONC string (preserving ALL comments!)
                        const before = modifiedContent.substring(0, serverNode.offset);
                        const after = modifiedContent.substring(
                            serverNode.offset + serverNode.length
                        );

                        // Restore raw config exactly as it was saved during wrapping
                        modifiedContent = before + rawConfig + after;
                        hasChanges = true;
                    } catch (error) {
                        this.logger.warn(`Failed to unwrap server ${serverName}:`, error);
                        // Skip this server, keep as-is
                    }
                }

                return {
                    modifiedContent,
                    hasChanges,
                    successMessage: "Unwrapped configuration with comments preserved",
                };
            }
        );

        // Remove from registry if unwrapping was successful
        if (wasUnwrapped) {
            await this.removeWrappedFile(configPath);
        }

        return wasUnwrapped;
    }

    /**
     * Process a single configuration file
     * Note: Circuit breaker and concurrency control are handled by FileWatcher
     */
    private async processConfigurationFile(configPath: string): Promise<void> {
        this.logger.info(`Processing configuration file:\n${configPath}`);

        // Read and parse configuration
        const config = await this.readConfiguration(configPath);
        if (!config) {
            return;
        }

        // Wrap MCP servers with Defenter proxy using JSONC tree manipulation
        const hasChanges = await this.wrapConfigurationInFile(configPath);
        if (!hasChanges) {
            this.logger.debug(`All servers already wrapped in: ${configPath}`);
        }

        this.logger.info(`Successfully processed configuration: ${configPath}`);
    }

    /**
     * Read and parse MCP configuration file
     */
    private async readConfiguration(configPath: string): Promise<MCPConfig | undefined> {
        try {
            const content = await fs.readFile(configPath, "utf8");
            return parseJsonc(content) as MCPConfig;
        } catch (error) {
            if (error instanceof SyntaxError) {
                this.logger.error(`Invalid JSON/JSONC in ${configPath}`, error);
                this.errorHandler.showError(
                    `Configuration file has invalid JSON/JSONC: ${configPath}\nPlease fix the JSON/JSONC syntax and save the file.`
                );
            } else {
                this.logger.error(`Failed to read configuration ${configPath}`, error);
            }
            return undefined;
        }
    }

    /**
     * Get the master key for MCP servers in this configuration
     */
    private getMcpServersKey(config: MCPConfig): keyof MCPConfig | undefined {
        // prioritized
        if (config.mcpServers !== undefined) {
            return "mcpServers";
        }
        if (config.servers !== undefined) {
            return "servers";
        }
        if (config.extensions !== undefined) {
            return "extensions";
        }
        this.logger.warn(
            "Invalid MCP configs; missing 'mcpServers'/'servers'/'extensions'"
        );
        return undefined;
    }

    /**
     * Check if a server configuration is already wrapped by our Defenter proxy
     * Uses presence of wrapped config args as sufficient indicator
     */
    private isAlreadyWrapped(serverConfig: MCPServerConfig): boolean {
        const hasArg = serverConfig.args?.includes("--wrapped-config");
        if (hasArg) {
            this.logger.debug("Server already wrapped (arg detected).");
        }
        return Boolean(hasArg);
    }

    /**
     * Wrap MCP configuration using JSONC tree manipulation to preserve comments
     * Also handles version migration for already-wrapped servers
     */
    async wrapConfigurationInFile(configPath: string): Promise<boolean> {
        if (!this.uvRunner) {
            this.logger.error(
                "Cannot wrap configuration: uv runner not initialized. Call startMonitoring() first."
            );
            return false;
        }

        const uvCommand = this.uvRunner.getCommand();
        const expectedFirstArg = uvCommand.args[0]; // defenter-proxy==X.Y.Z

        const result = await this.processConfigurationWithJsoncTree(
            configPath,
            async (content, config, serverKey, servers) => {
                let modifiedContent = content;
                let hasChanges = false;

                // Process each server for wrapping or version migration
                for (const [serverName, serverConfig] of Object.entries(servers)) {
                    const isWrapped = this.isAlreadyWrapped(serverConfig);

                    // Check if version matches current extension version
                    const hasCorrectVersion =
                        isWrapped && serverConfig.args?.[0] === expectedFirstArg;

                    // Skip only if already wrapped AND has correct version
                    if (hasCorrectVersion) {
                        continue;
                    }

                    // Need to wrap or re-wrap (version migration)
                    let rawServerJsonc: string;
                    let backupConfig: string | undefined;

                    if (isWrapped) {
                        // Extract raw config from wrapped server for re-wrapping
                        this.logger.info(
                            `Re-wrapping server ${serverName} for version migration`
                        );
                        const extracted = this.extractRawWrappedConfig(serverConfig);
                        if (!extracted) {
                            this.logger.warn(
                                `Failed to extract raw config for server ${serverName}, skipping`
                            );
                            continue;
                        }
                        rawServerJsonc = extracted;

                        backupConfig = serverConfig.__bak_configs;
                    } else {
                        // First-time wrapping: extract current server config

                        // Find server node in tree
                        const tree = parseTree(modifiedContent);
                        if (!tree) {
                            continue;
                        }
                        const serverNode = findNodeAtLocation(tree, [
                            serverKey,
                            serverName,
                        ]);
                        if (
                            !serverNode ||
                            serverNode.offset === undefined ||
                            serverNode.length === undefined
                        ) {
                            continue;
                        }

                        // Extract raw JSONC string AS-IS (zero manipulations!)
                        rawServerJsonc = modifiedContent.substring(
                            serverNode.offset,
                            serverNode.offset + serverNode.length
                        );
                    }

                    // Check if this is a URL-based config that needs mcp-remote wrapping
                    try {
                        const parsedConfig = parseJsonc(rawServerJsonc);

                        if (parsedConfig.url && isRemoteUrl(parsedConfig.url)) {
                            this.logger.info(
                                `Server ${serverName} has remote URL, wrapping with @mcpower/mcp-remote`
                            );

                            // backup original, non @mcpower/mcp-remote transformed configs
                            backupConfig ||= rawServerJsonc;

                            const mcpRemoteArgs = this.convertUrlConfigToMcpRemoteArgs(
                                parsedConfig,
                                serverName
                            );
                            const mcpRemoteConfig = {
                                command: "npx",
                                args: mcpRemoteArgs,
                                env: parsedConfig.env,
                            };

                            rawServerJsonc = JSON.stringify(mcpRemoteConfig);
                        }
                    } catch (error) {
                        this.logger.warn(
                            `Config is not URL-based or parsing failed for ${serverName}, proceeding with standard wrapping`
                        );
                    }

                    // Create wrapped configuration
                    const wrappedConfig: MCPServerConfig = {
                        command: uvCommand.executable,
                        args: [
                            ...uvCommand.args,
                            "--wrapped-config",
                            rawServerJsonc, // Save entire value AS-IS!
                            "--name",
                            serverName,
                        ],
                        env: serverConfig.env,
                        disabled: serverConfig.disabled,
                        __bak_configs: backupConfig,
                    };

                    // Use modify to replace server with wrapped config
                    const edits = modify(
                        modifiedContent,
                        [serverKey, serverName],
                        wrappedConfig,
                        {
                            formattingOptions: { insertSpaces: true, tabSize: 2 },
                        }
                    );
                    modifiedContent = applyEdits(modifiedContent, edits);
                    hasChanges = true;
                }

                return {
                    modifiedContent,
                    hasChanges,
                    successMessage: "Wrapped servers in",
                };
            }
        );

        // Register wrapped file in IDE-specific registry if changes were made
        if (result) {
            await this.addWrappedFile(configPath);
        }

        return result;
    }
}
