import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const screenshotsDir = path.resolve(__dirname, 'screenshots');
const serverPath = path.resolve(__dirname, 'server.cjs');

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
        command: `node "${serverPath}"`,
        url: 'http://localhost:9876',
        reuseExistingServer: false,
        timeout: 10_000,
        cwd: path.dirname(serverPath),
    },
    projects: [
        {
            name: 'Chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    timeout: 30_000,
});
