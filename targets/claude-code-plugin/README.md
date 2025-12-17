# Defenter Security for Claude Code

Automatic security wrapping for all MCP servers with real-time monitoring and policy
enforcement.

## Installation

Install the plugin using Claude Code's plugin management:

```bash
claude plugin install @defenter/claude-code-plugin
```

## How It Works

1. **SessionStart**: When Claude Code starts a session, the plugin checks for `uvx` and
   launches the background daemon
2. **Daemon**: Monitors MCP configuration files and automatically wraps new servers with
   Defenter proxy
3. **Hooks**: `UserPromptSubmit` and `PreToolUse` hooks invoke the Defenter CLI for
   real-time policy enforcement

## Configuration

The plugin discovers MCP configurations from:

- Workspace: `$CLAUDE_PROJECT_DIR/mcp.json`, `$CLAUDE_PROJECT_DIR/.mcp.json`,
  `$CLAUDE_PROJECT_DIR/.claude/mcp.json`
- System: `~/.claude/mcp.json`, `~/Library/Application Support/Claude/mcp.json` (macOS)

## Development

```bash
# Install dependencies (from targets/ root)
npm install

# Build
npm run build

# Watch mode
npm run watch

# Package for distribution
npm run package
```

## Uninstall

Before removing the plugin, run the cleanup script to unwrap MCP configurations:

```bash
# macOS/Linux
./scripts/uninstall.sh

# Windows
.\scripts\uninstall.bat
```

## License

Apache-2.0
