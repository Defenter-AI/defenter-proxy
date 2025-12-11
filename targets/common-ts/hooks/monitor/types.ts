interface CursorHookEntry {
    command: string;
    [key: string]: any;
}

export interface CursorHooksConfig {
    version: number;
    hooks: {
        [hookName: string]: CursorHookEntry[];
    };
}

interface ClaudeCodeHookAction {
    type: "command";
    command: string;
}

interface ClaudeCodeHookEntry {
    matcher?: string;
    hooks: ClaudeCodeHookAction[];
}

export interface ClaudeCodeHooksConfig {
    hooks: {
        [hookName: string]: ClaudeCodeHookEntry[];
    };
}

export interface ClaudeCodeSettingsConfig {
    hooks?: {
        [hookName: string]: ClaudeCodeHookEntry[];
    };
    [key: string]: any;
}
