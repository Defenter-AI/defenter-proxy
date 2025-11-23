#!/usr/bin/env bash

set -euo pipefail

log() {
    printf '%s\n' "$1"
}

ensure_uv() {
    if command -v uv >/dev/null 2>&1; then
        return 0
    fi

    log "uv not found; installing via Astral installer"
    curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null 2>&1

    if ! command -v uv >/dev/null 2>&1; then
        # shellcheck disable=SC2016
        log "uv installation succeeded but not on PATH; ensure \"$HOME/.local/bin\" is in PATH"
        export PATH="$HOME/.local/bin:$PATH"
    fi

    if ! command -v uv >/dev/null 2>&1; then
        log "uv still unavailable after installation"
        return 1
    fi
}

ensure_uvx() {
    if command -v uvx >/dev/null 2>&1; then
        return 0
    fi

    log "uvx shim missing; refreshing uv installation"
    uv self install >/dev/null 2>&1

    if ! command -v uvx >/dev/null 2>&1; then
        log "uvx not available; ensure uv is on PATH"
        return 1
    fi
}

ensure_node() {
    if command -v node >/dev/null 2>&1; then
        log "Node.js already available: $(node --version)"
        return 0
    fi

    log "Node.js not found; attempting installation"

    # Try Homebrew
    if command -v brew >/dev/null 2>&1; then
        log "Installing Node.js v22 via Homebrew..."
        if brew install node@22 2>/dev/null; then
            # Link node@22 to make it available in PATH
            brew link --overwrite node@22 2>/dev/null || true
            if command -v node >/dev/null 2>&1; then
                log "Node.js installed via Homebrew: $(node --version)"
                return 0
            fi
        fi
        log "Homebrew installation failed; trying nvm..."
    else
        log "Homebrew not found; trying nvm..."
    fi

    # Try nvm (Node Version Manager)
    log "Attempting Node.js v22 installation via nvm..."
    if ! [ -d "$HOME/.nvm" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh 2>/dev/null | bash 2>/dev/null
    fi
    
    # Load nvm
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        # shellcheck disable=SC1091
        . "$NVM_DIR/nvm.sh"
        
        if nvm install 22 2>/dev/null; then
            if command -v node >/dev/null 2>&1; then
                log "Node.js installed via nvm: $(node --version)"
                return 0
            fi
        fi
    fi

    log "All Node.js installation methods failed"
    log "Please install Node.js manually from https://nodejs.org/"
    return 1
}

cache_defenter_proxy() {
    local version="$1"
    local clean_cache="$2"

    if [[ -z "$version" ]]; then
        log "Version parameter is required; skipping cache"
        return 0
    fi

    local refresh_flag=""
    if [[ "$clean_cache" == "--clean-cache" ]]; then
        log "Pre-warming defenter-proxy==$version from PyPI (forcing refresh)..."
        refresh_flag="--refresh"
    else
        log "Pre-warming defenter-proxy==$version from PyPI..."
    fi

    uvx $refresh_flag defenter-proxy=="$version" --help >/dev/null 2>&1 || true
}

main() {
    log "Ensuring uvx is installed (macOS)"
    ensure_uv
    ensure_uvx

    # Parse arguments
    local version=""
    local clean_cache=""
    local daemon_mode=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --daemon)
                daemon_mode=true
                shift
                ;;
            --clean-cache)
                clean_cache="$1"
                shift
                ;;
            *)
                if [[ -z "$version" ]]; then
                    version="$1"
                fi
                shift
                ;;
        esac
    done

    # Daemon mode: ensure Node.js and refresh cache
    if [[ "$daemon_mode" == true ]]; then
        ensure_node
        clean_cache="--clean-cache"
    fi

    # Cache dependencies if version provided
    if [[ -n "$version" ]]; then
        cache_defenter_proxy "$version" "$clean_cache"
    fi

    log "uvx ready"
}

main "$@"
