import vscode from "vscode";
import { ConfigurationMonitor } from "@defenter/common-ts/monitors/configurationMonitor";
import { CursorHooksMonitor } from "@defenter/common-ts/hooks/monitor";
import { initialize as initializeCursorHooks } from "@defenter/common-ts/hooks/initialize";
import { VscodeConfigDiscoverer } from "./configsDiscoverer";
import { UvRunner } from "./uvRunner";
import { AuditTrailView } from "./auditTrail";
import { ExtensionState } from "./types";
import log from "./log";
import {
    detectIDEFromScriptPath,
    getCurrentExtensionVersion,
    getLastStoredExtensionVersion,
    updateStoredExtensionVersion,
} from "./utils";
import { reportLifecycleEvent } from "./api";
import { IErrorHandler, ILogger } from "@defenter/common-ts/types";
import { getCursorUserHooksPath } from "@defenter/common-ts/utils";

class VscodeLoggerAdapter implements ILogger {
    debug(message: string, ...args: any[]): void {
        log.debug(message, ...args);
    }
    info(message: string, ...args: any[]): void {
        log.info(message, ...args);
    }
    warn(message: string, ...args: any[]): void {
        log.warn(message, ...args);
    }
    error(message: string, error?: any): void {
        log.error(message, error);
    }
}

class VscodeErrorHandler implements IErrorHandler {
    showError(message: string): void {
        vscode.window.showErrorMessage(message);
    }
}

let state: ExtensionState | undefined;

const showPersistentAction = async (
    message: string,
    actionText: string,
    onAction: () => void
): Promise<void> => {
    const commandId = `defenter.tempAction_${Date.now()}`;

    const disposable = vscode.commands.registerCommand(commandId, () => {
        disposable.dispose();
        onAction();
    });

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `${message} - [${actionText}](command:${commandId})`,
            cancellable: false,
        },
        async () => new Promise(() => {})
    );
};

const performInitialization = async (
    _state: Omit<ExtensionState, "configMonitor" | "cursorHooksMonitor">
): Promise<void> => {
    const ideType = detectIDEFromScriptPath();
    const errorHandler = new VscodeErrorHandler();
    const logger = new VscodeLoggerAdapter();
    const discoverer = new VscodeConfigDiscoverer();

    state = {
        ..._state,
        configMonitor: new ConfigurationMonitor(errorHandler, logger, ideType),
        cursorHooksMonitor:
            ideType === "cursor"
                ? new CursorHooksMonitor(
                      _state.context.extensionPath,
                      errorHandler,
                      logger
                  )
                : undefined,
    };
    await state.uvRunner.initialize();

    // Listen for workspace folder changes
    const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(
        async event => {
            log.info(
                `Workspace folders changed: added=${event.added.join(",")}, removed=${event.removed.join(",")}`
            );
            await state!.configMonitor.handleWorkspaceChange();
        }
    );
    state.context.subscriptions.push(workspaceChangeListener);

    // Start MCP configuration monitoring
    await state.configMonitor.startMonitoring(state.uvRunner, discoverer);

    // Start Cursor hooks monitoring
    if (state.cursorHooksMonitor) {
        const hooksFilePath = getCursorUserHooksPath();
        const workspaceRoots =
            vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
        await initializeCursorHooks(state.uvRunner, workspaceRoots, logger);
        await state.cursorHooksMonitor.startMonitoring([hooksFilePath]);
    }

    const auditTrailView = new AuditTrailView(state.context);
    await auditTrailView.initialize();
    state.context.subscriptions.push({
        dispose: () => auditTrailView.dispose(),
    });
};

// noinspection JSUnusedGlobalSymbols
export async function activate(context: vscode.ExtensionContext) {
    log.info("Extension is now active");

    try {
        const currentVersion = getCurrentExtensionVersion(context);
        const storedVersion = await getLastStoredExtensionVersion(context);

        log.info(
            `Extension version check: current=${currentVersion}, stored=${storedVersion}`
        );

        const isFirstActivation = !storedVersion;
        const isUpdate = storedVersion && storedVersion !== currentVersion;

        // Report lifecycle event
        try {
            if (isUpdate) {
                log.info(`Extension updated from ${storedVersion} to ${currentVersion}`);
                await reportLifecycleEvent("update");
            } else if (isFirstActivation) {
                log.info("First-time extension activation");
                await reportLifecycleEvent("install");
            } else {
                log.debug("Extension version unchanged");
                await reportLifecycleEvent("heartbeat");
            }
        } catch {
            // never crash
        }

        const uvRunner = new UvRunner(context);

        if (isFirstActivation || isUpdate) {
            // Warm up the new version
            log.info(`Warming up defenter-proxy==${currentVersion}...`);
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `🛠️ ${isFirstActivation ? "Installing" : "Updating"} Defenter, please wait...`,
                    cancellable: false,
                },
                // initialize will take some time,
                // do it while showing a progressing notification
                () => uvRunner.initialize(true)
            );

            // Only after successful warm-up, save the new version
            await updateStoredExtensionVersion(context);

            // Perform full initialization
            await performInitialization({ context, uvRunner });

            // Show the appropriate message
            if (isFirstActivation) {
                await showPersistentAction("✅ Defenter Installed", "Activate", () => {
                    setTimeout(() => {
                        vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }, 100);
                });
            } else {
                await showPersistentAction("✅ Defenter updated", "Apply changes", () => {
                    setTimeout(() => {
                        vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }, 100);
                });
            }
        } else {
            // No update needed, just initialize normally
            await performInitialization({ context, uvRunner });
            vscode.window.showInformationMessage(`✅ Defenter activated`);
        }
    } catch (error) {
        log.error("Failed to activate Defenter", error);
        vscode.window.showErrorMessage(`Failed to activate Defenter: ${error}`);
    }
}

// noinspection JSUnusedGlobalSymbols
export async function deactivate() {
    if (state) {
        try {
            log.info("Extension deactivating...");

            // Stop MCP configuration monitoring
            await state.configMonitor.stopMonitoring();

            // Stop Cursor hooks monitoring (but keep hooks registered)
            await state.cursorHooksMonitor?.stopMonitoring();
        } catch (error) {
            log.error("Error during extension deactivation", error);
        }
        state = undefined;
    }
    log.info("Extension deactivated");
}
