const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

/** @type {import('webpack').Configuration} */
module.exports = {
    target: "node",
    mode: "production",
    entry: {
        launcher: "./src/launcher.ts",
        uninstall: "./src/uninstall.ts",
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js",
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
                exclude: [/node_modules/, /\.test\.ts$/, /tests\//, /__tests__\//],
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
    devtool: false,
};
