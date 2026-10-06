#!/usr/bin/env node
import { execFileSync } from 'child_process';

/**
 * Starts a throwaway n8n in Docker and prints the env lines the live tests read.
 *
 *   CI:    node scripts/start-test-n8n.mjs n8n@2.41.7 >> "$GITHUB_ENV"
 *   Local: node scripts/start-test-n8n.mjs n8n@2.41.7 > .env.test
 *          then `docker stop n8nac-test-n8n` when done.
 *
 * The owner account and the API key go through the same /rest calls the n8n UI
 * makes on a fresh instance: n8n has no CLI command or env var that mints an API key.
 */

const version = process.argv[2]?.replace(/^n8n@/, '');
if (!version) {
    console.error('Usage: node scripts/start-test-n8n.mjs <n8n version, e.g. n8n@2.41.7>');
    process.exit(1);
}

const host = 'http://localhost:5678';

// stdout is the env file: keep the container id out of it.
execFileSync(
    'docker',
    ['run', '-d', '--rm', '--name', 'n8nac-test-n8n', '-p', '5678:5678', `docker.n8n.io/n8nio/n8n:${version}`],
    { stdio: ['ignore', 'ignore', 'inherit'] }
);

// Readiness only answers 200 once the database is migrated and every route is registered.
for (let attempt = 1; ; attempt++) {
    const ready = await fetch(`${host}/healthz/readiness`).then((res) => res.ok, () => false);
    if (ready) break;
    if (attempt === 90) throw new Error(`n8n ${version} was still not ready after 3 minutes.`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function rest(path, { cookie, body } = {}) {
    const res = await fetch(`${host}/rest${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(cookie && { cookie }) },
        body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} answered ${res.status}: ${await res.text()}`);
    return res;
}

const owner = await rest('/owner/setup', {
    body: { email: 'owner@example.com', firstName: 'n8nac', lastName: 'CI', password: 'Throwaway1' },
});
const cookie = owner.headers.getSetCookie().find((c) => c.startsWith('n8n-auth='))?.split(';')[0];

const { data: scopes } = await rest('/api-keys/scopes', { cookie }).then((res) => res.json());
const { data: apiKey } = await rest('/api-keys', {
    cookie,
    body: { label: 'n8nac live tests', expiresAt: null, scopes },
}).then((res) => res.json());

console.log(`N8N_HOST=${host}`);
console.log(`N8N_API_KEY=${apiKey.rawApiKey}`);
