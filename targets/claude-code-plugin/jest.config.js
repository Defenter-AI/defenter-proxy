module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/*.test.ts"],
    // Run tests sequentially - they share the daemon PID file
    maxWorkers: 1,
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.d.ts"],
    moduleNameMapper: {
        "^@defenter/common-ts/(.*)$": "<rootDir>/../common-ts/$1",
    },
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: {
                    module: "commonjs",
                    esModuleInterop: true,
                    skipLibCheck: true,
                },
            },
        ],
    },
};
