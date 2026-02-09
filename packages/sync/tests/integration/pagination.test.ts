import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'node:module';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';

const envPaths = [
    path.resolve(process.cwd(), '.env.test'),
    path.resolve(process.cwd(), '../../.env.test'),
    path.resolve(new URL('.', import.meta.url).pathname, '../../../../.env.test')
];

let envPath: string | undefined;
for (const candidate of envPaths) {
    if (fs.existsSync(candidate)) {
        envPath = candidate;
        dotenv.config({ path: envPath });
        break;
    }
}

const host = process.env.N8N_HOST || 'http://localhost:5678';
const apiKey = process.env.N8N_API_KEY || '';

const require = createRequire(import.meta.url);
const { createWorkflows, deleteWorkflowsByPrefix } = require('../../../../scripts/pagination/workflow-seeder.cjs');

const COUNT = 20;
const PREFIX = `Pagination Test ${Date.now()} `;

test('Pagination Integration - retrieves full cursor set', { skip: !apiKey || !envPath }, async () => {
    const client = new N8nApiClient({ host, apiKey });
    let created: Array<{ id: string; name: string }> = [];

    try {
        created = await createWorkflows({ envPath, count: COUNT, prefix: PREFIX, delayMs: 50 });
        assert.strictEqual(created.length, COUNT);

        let missing = created.map(w => w.id);
        for (let attempt = 0; attempt < 15; attempt++) {
            const workflows = await client.getAllWorkflows();
            const found = new Set(workflows.map(w => w.id));
            missing = created.map(w => w.id).filter(id => !found.has(id));
            if (missing.length === 0) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        assert.strictEqual(missing.length, 0, `Missing ${missing.length} workflows after retries`);
    } finally {
        await deleteWorkflowsByPrefix({ envPath, prefix: PREFIX, confirm: true, delayMs: 50 });
    }
});
