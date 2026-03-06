module.exports = {
    testEnvironment: 'node',
    moduleNameMapper: {
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
