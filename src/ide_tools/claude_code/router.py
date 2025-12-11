"""Claude Code hook router"""

import asyncio
import json
import sys
import uuid

from ide_tools.common.hooks.init import handle_init
from ide_tools.common.hooks.prompt_submit import handle_prompt_submit
from ide_tools.common.hooks.read_file import handle_read_file
from ide_tools.common.hooks.shell_execution import handle_shell_execution
from ide_tools.common.hooks.types import HookConfig, OutputFormat
from modules.logs.audit_trail import AuditTrailLogger
from modules.logs.logger import MCPLogger
from .format import CLAUDE_CODE_OUTPUT, format_permission_request
from .hooks_definition import CLAUDE_CODE_HOOKS

CLAUDE_CODE_CONFIG = HookConfig(
    output_format=CLAUDE_CODE_OUTPUT,
    server_name="claude_code_tools",
    client_name="claude-code",
    max_content_length=100000
)


def _get_permission_request_config() -> HookConfig:
    return HookConfig(
        output_format=OutputFormat(
            allow_exit_code=0,
            deny_exit_code=0,
            error_exit_code=1,
            formatter=lambda ht, allowed, um, am: format_permission_request(allowed, am or um)
        ),
        server_name=CLAUDE_CODE_CONFIG.server_name,
        client_name=CLAUDE_CODE_CONFIG.client_name,
        max_content_length=CLAUDE_CODE_CONFIG.max_content_length
    )


def route_claude_code_hook(logger: MCPLogger, audit_logger: AuditTrailLogger, stdin_input: str):
    try:
        input_data = json.loads(stdin_input)

        hook_event_name = input_data.get("hook_event_name")
        if not hook_event_name:
            logger.error("Missing required field 'hook_event_name' in input")
            sys.exit(1)

        session_id = input_data.get("session_id")
        if not session_id:
            logger.error("Missing required field 'session_id' in input")
            sys.exit(1)

        cwd = input_data.get("cwd")
        if not cwd:
            logger.error("Missing required field 'cwd' in input")
            sys.exit(1)

        prompt_id = session_id[:8]
        event_id = uuid.uuid4().hex[:8]

        logger.info(f"Routing {hook_event_name} (prompt_id={prompt_id}, event_id={event_id})")

        if hook_event_name == "SessionStart":
            asyncio.run(handle_init(
                logger=logger,
                audit_logger=audit_logger,
                event_id=event_id,
                cwd=cwd,
                server_name=CLAUDE_CODE_CONFIG.server_name,
                client_name="claude-code",
                hooks=CLAUDE_CODE_HOOKS
            ))

        elif hook_event_name == "UserPromptSubmit":
            # Pass as-is - Claude Code provides {prompt}, handler will use empty attachments
            asyncio.run(handle_prompt_submit(
                logger, audit_logger, stdin_input, prompt_id, event_id, cwd, CLAUDE_CODE_CONFIG, "UserPromptSubmit"))

        elif hook_event_name in ["PreToolUse", "PermissionRequest"]:
            # Both hooks use same tool_name/tool_input structure, differ only in output format
            tool_name = input_data.get("tool_name", "")
            tool_input = input_data.get("tool_input", {})
            is_permission_request = hook_event_name == "PermissionRequest"
            config = _get_permission_request_config() if is_permission_request else CLAUDE_CODE_CONFIG

            if tool_name in ["Read", "Grep"]:
                unwrapped = {"file_path": tool_input.get("file_path"), "content": tool_input.get("content")}
                asyncio.run(handle_read_file(
                    logger, audit_logger, json.dumps(unwrapped), prompt_id, event_id, cwd,
                    config, f"{hook_event_name}({tool_name})"))

            elif tool_name == "Bash":
                unwrapped = {"command": tool_input.get("command"), "cwd": cwd}
                asyncio.run(handle_shell_execution(
                    logger, audit_logger, json.dumps(unwrapped), prompt_id, event_id, cwd,
                    config, f"{hook_event_name}({tool_name})", is_request=True))

            else:
                logger.warning(f"Unknown tool_name in {hook_event_name}: {tool_name}, allowing")
                if is_permission_request:
                    print(format_permission_request(True), flush=True)
                else:
                    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}), flush=True)
                sys.exit(0)

        else:
            logger.error(f"Unknown hook_event_name: {hook_event_name}")
            sys.exit(1)

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse input JSON: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Routing error: {e}", exc_info=True)
        sys.exit(1)
