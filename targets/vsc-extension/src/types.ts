import * as vscode from "vscode";
import { ConfigurationMonitor } from "@defenter/common-ts/mcp/monitor";
import { CursorHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { UvRunner } from "./uvRunner";

export interface ExtensionState {
    context: vscode.ExtensionContext;
    uvRunner: UvRunner;
    configMonitor: ConfigurationMonitor;
    cursorHooksMonitor?: CursorHooksMonitor; // Only initialized when running in Cursor IDE
}
