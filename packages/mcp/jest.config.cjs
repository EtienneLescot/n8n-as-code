module.exports = {
    testEnvironment: 'node',
    moduleNameMapper: {
        // Test this workspace's skills package, not whatever a parent node_modules resolves to.
        '^@n8n-as-code/skills$': '<rootDir>/../skills/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    module: 'ESNext',
                    moduleResolution: 'Bundler',
                    target: 'ES2022',
                    isolatedModules: true,
                    verbatimModuleSyntax: false,
                },
            },
        ],
    },
    extensionsToTreatAsEsm: ['.ts'],
    testMatch: ['**/tests/**/*.test.ts'],
    verbose: true,
};
