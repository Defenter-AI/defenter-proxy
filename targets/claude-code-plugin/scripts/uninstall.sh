#!/usr/bin/env bash
# Defenter Uninstall Script for Claude Code
# Unwraps all MCP configurations before uninstall

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT}"

if [ -z "$PLUGIN_ROOT" ]; then
    echo "Warning: CLAUDE_PLUGIN_ROOT not set, using current directory"
    PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

echo "Defenter Uninstall - Unwrapping all MCP configurations..."

# Stop any background monitoring processes
pkill -f "defenter.*daemon" 2>/dev/null || true

# Run uninstall script
cd "$PLUGIN_ROOT"
if [ -f "dist/uninstall.js" ]; then
    node dist/uninstall.js || echo "Warning: Uninstall script failed"
else
    echo "Warning: uninstall.js not found, cannot unwrap configurations"
fi

echo "Defenter uninstall cleanup completed"

