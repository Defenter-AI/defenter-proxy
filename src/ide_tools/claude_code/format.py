"""Claude Code output formatting using hookSpecificOutput structure"""

import json
from typing import Optional

from ide_tools.common.hooks.types import OutputFormat


def claude_code_output_formatter(hook_type: str, allowed: bool, user_msg: Optional[str],
                                 agent_msg: Optional[str]) -> str:
    """Format hook output: permission (PreToolUse), permission_request, or continue (UserPromptSubmit)"""
    if hook_type == "permission":
        hook_output = {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow" if allowed else "deny"
        }
        if user_msg or agent_msg:
            hook_output["permissionDecisionReason"] = agent_msg or user_msg
        result = {"hookSpecificOutput": hook_output}

    elif hook_type == "permission_request":
        decision = {"behavior": "allow" if allowed else "deny"}
        if not allowed and (user_msg or agent_msg):
            decision["message"] = agent_msg or user_msg
        result = {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": decision}}

    else:
        if not allowed:
            result = {
                "decision": "block",
                "reason": agent_msg or user_msg or "Blocked by security policy",
                "hookSpecificOutput": {"hookEventName": "UserPromptSubmit"}
            }
        else:
            result = {}

    return json.dumps(result)


def format_permission_request(allowed: bool, message: Optional[str] = None) -> str:
    """Format PermissionRequest hook output"""
    decision = {"behavior": "allow" if allowed else "deny"}
    if not allowed and message:
        decision["message"] = message
    return json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": decision}})


CLAUDE_CODE_OUTPUT = OutputFormat(
    allow_exit_code=0,
    deny_exit_code=0,  # Claude Code uses structured output, not exit codes
    error_exit_code=1,  # Exit 1 unexpected errors
    formatter=claude_code_output_formatter
)
