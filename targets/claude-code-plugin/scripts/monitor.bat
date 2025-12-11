@echo off
REM Defenter Configuration Monitor for Claude Code (Windows)
REM Wraps MCP server configurations on session start

setlocal

REM Get the plugin root directory
set PLUGIN_ROOT=%CLAUDE_PLUGIN_ROOT%

if "%PLUGIN_ROOT%"=="" (
    echo Error: CLAUDE_PLUGIN_ROOT not set
    exit /b 1
)

REM Run the configuration monitor
cd /d "%PLUGIN_ROOT%"
node dist\launcher.js monitor


