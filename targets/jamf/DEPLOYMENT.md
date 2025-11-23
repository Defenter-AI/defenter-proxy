# Jamf Target Deployment Guide

## Files to Deploy

After running `npm run build` in `targets/jamf/`, **deploy the entire `dist/` folder contents** to `/usr/local/defenter/`:

```
jamf/dist/                                    ← Source (deploy this entire folder)
├── defenter-jamf.sh                          # Main entry point
├── index.js                                  # Bundled Node.js application
└── scripts/
    ├── setup-uvx-macos.sh                    # UV/Node.js installer
    └── cursor/
        └── hooks/
            └── defenter-cursor-hook.sh       # Hook script

↓ Deploy to ↓

/usr/local/defenter/                          ← Deployment destination
├── defenter-jamf.sh
├── index.js
└── scripts/
    ├── setup-uvx-macos.sh
    └── cursor/hooks/
        └── defenter-cursor-hook.sh
```

## Runtime Path Resolution

### 1. Entry Point (`defenter-jamf.sh`)
```bash
SCRIPT_DIR="/usr/local/defenter"               # Resolved at runtime
"$SCRIPT_DIR/scripts/setup-uvx-macos.sh"
export DEFENTER_EXTENSION_PATH="$SCRIPT_DIR"
node "$SCRIPT_DIR/index.js" "$@"
```

### 2. Node.js Application (`index.js`)
```javascript
const extensionPath = process.env.DEFENTER_EXTENSION_PATH || __dirname;
// = "/usr/local/defenter" (from env var)
```

### 3. Hook Scripts Resolution
```javascript
join(extensionPath, "scripts", "cursor", "hooks", "defenter-cursor-hook.sh")
// = "/usr/local/defenter/scripts/cursor/hooks/defenter-cursor-hook.sh" ✅
```

## Post-Deploy Setup

After copying files to `/usr/local/defenter/`, run:

```bash
chmod +x /usr/local/defenter/defenter-jamf.sh
chmod +x /usr/local/defenter/scripts/setup-uvx-macos.sh
chmod +x /usr/local/defenter/scripts/cursor/hooks/defenter-cursor-hook.sh
```
