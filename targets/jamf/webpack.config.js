const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
    target: "node",
    mode: "production",
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "index.js",
    },
    externals: {
        fsevents: "commonjs fsevents",
    },
    resolve: {
        extensions: [".ts", ".js"],
        mainFields: ["module", "main"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: [
                    /node_modules/,
                    /\.test\.ts$/,
                    /tests\//,
                    /__tests__\//,
                ],
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                module: "esnext",
                            },
                            transpileOnly: false,
                            onlyCompileBundledFiles: true,
                        },
                    },
                ],
            },
        ],
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "../scripts/cursor/hooks/defenter-cursor-hook.sh"),
                    to: path.resolve(__dirname, "dist/scripts/cursor/hooks/defenter-cursor-hook.sh"),
                },
                {
                    from: path.resolve(__dirname, "../scripts/setup-uvx-macos.sh"),
                    to: path.resolve(__dirname, "dist/scripts/setup-uvx-macos.sh"),
                },
                {
                    from: path.resolve(__dirname, "defenter-jamf.sh"),
                    to: path.resolve(__dirname, "dist/defenter-jamf.sh"),
                },
                {
                    from: path.resolve(__dirname, "ai.defenter.jamf.plist"),
                    to: path.resolve(__dirname, "dist/ai.defenter.jamf.plist"),
                },
            ],
        }),
    ],
    devtool: false,
};

