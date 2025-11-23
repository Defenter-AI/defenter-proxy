# Jamf Target Deployment Guide

## Files to Deploy

After running `npm run build` in `targets/jamf/`, **deploy the entire `dist/` folder contents** to `/usr/local/defenter/`:

```
jamf/dist/                                    ← Source (deploy this entire folder)
├── ai.defenter.jamf.plist                    # launchd daemon config
├── defenter-jamf.sh                          # Main entry point
├── index.js                                  # Bundled Node.js application
└── scripts/
    ├── setup-uvx-macos.sh                    # UV/Node.js installer
    └── cursor/
        └── hooks/
            └── defenter-cursor-hook.sh       # Hook script

↓ Deploy to ↓

/Library/LaunchDaemons/                       ← launchd config
└── ai.defenter.jamf.plist

/usr/local/defenter/                          ← Application files
├── defenter-jamf.sh
├── index.js
└── scripts/
    ├── setup-uvx-macos.sh
    └── cursor/hooks/
        └── defenter-cursor-hook.sh
```

## Deployment Steps

### 1. Build the Package
```bash
cd targets/jamf
npm run build
```

### 2. Jamf: Deploy Application Files
```bash
# dist-file -> target-dir
defenter-jamf.sh /usr/local/defenter/
index.js /usr/local/defenter/
scripts /usr/local/defenter/
ai.defenter.jamf.plist /Library/LaunchDaemons/
```

### 3. Post-Deploy script
```bash
# Set correct ownership and permissions
sudo chmod +x /usr/local/defenter/defenter-jamf.sh
sudo chmod +x /usr/local/defenter/scripts/setup-uvx-macos.sh
sudo chmod +x /usr/local/defenter/scripts/cursor/hooks/defenter-cursor-hook.sh
sudo chown root:wheel /Library/LaunchDaemons/ai.defenter.jamf.plist
sudo chmod 644 /Library/LaunchDaemons/ai.defenter.jamf.plist
# Load and start the daemon
sudo launchctl load /Library/LaunchDaemons/ai.defenter.jamf.plist
# Check if daemon is loaded
sudo launchctl list | grep ai.defenter
# Check logs
tail -f /usr/local/defenter/jamf.log
tail -f /usr/local/defenter/jamf-error.log
```

## Daemon Management

### Start Daemon
```bash
sudo launchctl load /Library/LaunchDaemons/ai.defenter.jamf.plist
```

### Stop Daemon
```bash
sudo launchctl unload /Library/LaunchDaemons/ai.defenter.jamf.plist
```

### Check Status
```bash
sudo launchctl list | grep ai.defenter.jamf
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
// = "/usr/local/defenter/scripts/cursor/hooks/defenter-cursor-hook.sh"
```
