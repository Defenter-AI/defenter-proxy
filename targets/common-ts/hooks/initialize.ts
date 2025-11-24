import { spawn } from "child_process";
import { ILogger, IUvRunner } from "@defenter/common-ts/types";

/**
 * Initialize Cursor hooks with security API (call init handler)
 * This must be called before registering hooks to set up the Cursor hooks system
 */
export async function initialize(
    uvRunner: IUvRunner,
    workspaceRoots: string[],
    logger: ILogger
): Promise<void> {
    try {
        logger.info("Cursor Hooks: Initializing hooks with security API");

        const uvCommand = uvRunner.getCommand();
        const args = [...uvCommand.args, "--ide-tool", "--ide", "cursor"];

        return new Promise((resolve, reject) => {
            const proc = spawn(uvCommand.executable, args, {
                stdio: "pipe",
                shell: false,
            });

            // Send common schema input via stdin immediately after spawn
            if (proc.stdin) {
                try {
                    const input = JSON.stringify({
                        conversation_id: `${Date.now()}`.slice(-8),
                        generation_id: `${Date.now()}`.slice(-8),
                        hook_event_name: "init",
                        workspace_roots: workspaceRoots,
                    });
                    proc.stdin.write(input);
                    proc.stdin.end();
                } catch (error) {
                    logger.error(
                        "Cursor Hooks: Failed to write to init handler stdin",
                        error
                    );
                }
            }

            let stdout = "";
            let stderr = "";

            proc.stdout?.on("data", data => {
                stdout += data.toString();
            });

            proc.stderr?.on("data", data => {
                stderr += data.toString();
            });

            proc.on("close", code => {
                if (code === 0) {
                    logger.info("Cursor Hooks: Init handler completed successfully");
                    if (stdout) {
                        logger.debug(`Init handler output: ${stdout}`);
                    }
                    resolve();
                } else {
                    logger.error(
                        `Cursor Hooks: Init handler failed with exit code ${code}`
                    );
                    if (stderr) {
                        logger.error(`Init handler stderr: ${stderr}`);
                    }
                    // Don't reject - allow monitoring to continue even if init fails
                    resolve();
                }
            });

            proc.on("error", error => {
                logger.error("Cursor Hooks: Failed to spawn init handler", error);
                // Don't reject - allow monitoring to continue even if init fails
                resolve();
            });
        });
    } catch (error) {
        logger.error("Cursor Hooks: Failed to initialize hooks", error);
        // Don't fail the entire monitoring if init fails
    }
}
