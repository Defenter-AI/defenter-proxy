"""Claude Code hook definitions"""

CLAUDE_CODE_HOOKS = {
    "UserPromptSubmit": {
        "name": "UserPromptSubmit",
        "description": "Runs when the user submits a prompt, before Claude processes it.",
        "version": "1.0.0",
        "parameters": '{"type":"object","properties":{"prompt":{"type":"string"}},"required":["prompt"]}'
    },
    "PreToolUse_Read": {
        "name": "PreToolUse(Read)",
        "description": "Triggered before the agent reads a file.",
        "version": "1.0.0",
        "parameters": '{"type":"object","properties":{"file_path":{"type":"string"},"content":{"type":"string"}}}'
    },
    "PreToolUse_Grep": {
        "name": "PreToolUse(Grep)",
        "description": "Triggered before the agent searches file contents.",
        "version": "1.0.0",
        "parameters": '{"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string"}}}'
    },
    "PreToolUse_Bash": {
        "name": "PreToolUse(Bash)",
        "description": "Triggered before a shell command is executed.",
        "version": "1.0.0",
        "parameters": '{"type":"object","properties":{"command":{"type":"string"}},"required":["command"]}'
    },
    "PermissionRequest": {
        "name": "PermissionRequest",
        "description": "Triggered when Claude requests permission for a tool use.",
        "version": "1.0.0",
        "parameters": '{"type":"object","properties":{"tool_name":{"type":"string"},"tool_input":{"type":"object"}}}'
    }
}
