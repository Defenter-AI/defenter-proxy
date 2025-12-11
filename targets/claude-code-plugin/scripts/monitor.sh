#!/usr/bin/env bash
# Defenter Configuration Monitor for Claude Code
# Wraps MCP server configurations on session start

set -e

# Get the plugin root directory
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"

if [ -z "$PLUGIN_ROOT" ]; then
    echo "Error: CLAUDE_PLUGIN_ROOT not set"
    exit 1
fi

# Run the configuration monitor
cd "$PLUGIN_ROOT"
node dist/launcher.js monitor


