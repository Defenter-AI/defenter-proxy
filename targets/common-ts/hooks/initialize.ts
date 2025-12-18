import { spawn } from "child_process";
import { ILogger, IUvRunner } from "@defenter/common-ts/types";

/**
 * Initialize hooks with backend (call init handler)
 * This must be called before registering hooks to set up the hooks system
 */
export async function initialize(
    uvRunner: IUvRunner,
    stdinInput: string,
    logger: ILogger,
    ide: string
): Promise<void> {
    try {
        logger.info(`${ide} Hooks: Initializing hooks with backend`);

        const uvCommand = uvRunner.getCommand();
        const args = [...uvCommand.args, "--ide-tool", "--ide", ide];

        return new Promise(resolve => {
            const proc = spawn(uvCommand.executable, args, {
                stdio: "pipe",
                shell: false,
            });

            if (proc.stdin) {
                try {
                    proc.stdin.write(stdinInput);
                    proc.stdin.end();
                } catch (error) {
                    logger.error(
                        `${ide} Hooks: Failed to write to init handler stdin`,
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
                    logger.info(`${ide} Hooks: Init handler completed successfully`);
                    if (stdout) {
                        logger.debug(`Init handler output: ${stdout}`);
                    }
                    resolve();
                } else {
                    logger.error(
                        `${ide} Hooks: Init handler failed with exit code ${code}`
                    );
                    if (stderr) {
                        logger.error(`Init handler stderr: ${stderr}`);
                    }
                    // Don't reject - allow monitoring to continue even if init fails
                    resolve();
                }
            });

            proc.on("error", error => {
                logger.error(`${ide} Hooks: Failed to spawn init handler`, error);
                // Don't reject - allow monitoring to continue even if init fails
                resolve();
            });
        });
    } catch (error) {
        logger.error(`${ide} Hooks: Failed to initialize hooks`, error);
        // Don't fail the entire monitoring if init fails
    }
}
