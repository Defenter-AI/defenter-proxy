import { IErrorHandler } from "@defenter/common-ts/types";

/**
 * Error handler for Claude Code plugin
 * Outputs errors to stderr for visibility in Claude Code hooks
 */
export class ClaudeCodeErrorHandler implements IErrorHandler {
    showError(message: string): void { console.error(message); }
}
