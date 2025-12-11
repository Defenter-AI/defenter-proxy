@echo off
REM Defenter Uninstall Script for Claude Code (Windows)
REM Unwraps all MCP configurations before uninstall

setlocal

set PLUGIN_ROOT=%CLAUDE_PLUGIN_ROOT%

if "%PLUGIN_ROOT%"=="" (
    echo Warning: CLAUDE_PLUGIN_ROOT not set, using current directory
    cd /d "%~dp0\.."
    set PLUGIN_ROOT=%CD%
)

echo Unwrapping all MCP configurations...

REM Stop any background monitoring processes
taskkill /FI "WINDOWTITLE eq defenter*" /F 2>nul

REM Run uninstall script
cd /d "%PLUGIN_ROOT%"
if exist "dist\uninstall.js" (
    node dist\uninstall.js
) else (
    echo Warning: uninstall.js not found, cannot unwrap configurations
)

echo Defenter uninstall cleanup completed

