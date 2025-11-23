#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure uvx and Node.js are available (daemon mode: installs Node.js + refreshes cache)
"$SCRIPT_DIR/scripts/setup-uvx-macos.sh" --daemon

# Export environment variables for Node.js script
export DEFENTER_EXTENSION_PATH="$SCRIPT_DIR"

# Run bundled Node.js app
exec node "$SCRIPT_DIR/index.js" "$@"

