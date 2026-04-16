import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const screenshotsDir = path.resolve(__dirname, 'screenshots');

export default defineConfig({
    testDir: __dirname,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: 'http://localhost:9876',
        viewport: { width: 900, height: 700 },
        screenshot: { mode: 'only-on-failure', fullPage: true },
    },
    webServer: {
        command: 'node tests/e2e/server.cjs',
        url: 'http://localhost:9876',
        reuseExistingServer: true,
        timeout: 10_000,
    },
    projects: [
        {
            name: 'Chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    timeout: 30_000,
});
