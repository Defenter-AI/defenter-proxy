/**
 * MCP Server Configuration Types
 * Ported from VSC extension for Claude Code plugin
 */

export interface MCPServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
    // Backup of original, non-transformed configs;
    // This key won't be set unless configs are being transformed
    __bak_configs?: string;
}

export interface MCPConfig {
    mcpServers?: Record<string, MCPServerConfig>; // Traditional format
    servers?: Record<string, MCPServerConfig>; // VSCode format
    extensions?: Record<string, MCPServerConfig>; // Another format
}

export interface UvCommand {
    executable: string;
    args: string[];
}

/**
 * Error handler abstraction for showing errors to users
 */
export interface IErrorHandler {
    showError(message: string): void;
}

/**
 * Config file discoverer abstraction
 */
export interface IConfigDiscoverer {
    discoverConfigFiles(): Promise<string[]>;
}

export interface IUvRunner {
    initialize(cleanCache?: boolean): Promise<void>;
    getCommand(): UvCommand;
}

export interface ILogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, error?: any): void;
}

export interface OSUser {
    username: string;
    homeDir: string;
}
