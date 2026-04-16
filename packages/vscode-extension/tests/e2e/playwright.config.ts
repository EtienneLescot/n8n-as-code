import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const screenshotsDir = path.resolve(__dirname, 'screenshots');
const serverPath = path.resolve(__dirname, 'server.cjs');

// Load .env.test for n8n credentials
function loadEnvTest() {
    const envPath = '/home/etienne/repos/n8n-as-code/.env.test';
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n');
    const lines = content.split('\n');
    const env: Record<string, string> = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex < 0) continue;
        const key = trimmed.slice(0, eqIndex);
        let value = trimmed.slice(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }
    return env;
}

const envTest = loadEnvTest();

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
        env: {
            N8N_HOST: envTest['N8N_HOST'] || 'https://etiennel.app.n8n.cloud',
            N8N_API_KEY: envTest['N8N_API_KEY'] || '',
        },
    },
    projects: [
        {
            name: 'Chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    timeout: 30_000,
});