import { NodeSchemaProvider } from '../src/services/node-schema-provider';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('NodeSchemaProvider', () => {
    let tempDir: string;
    let indexPath: string;
    let provider: NodeSchemaProvider;

    const mockIndex = {
        nodes: {
            slack: {
                name: 'slack',
                displayName: 'Slack',
                description: 'Send Slack messages',
                version: 1,
                properties: []
            },
            postgres: {
                name: 'postgres',
                displayName: 'PostgreSQL',
                description: 'Run SQL queries',
                version: [1, 2],
                properties: []
            }
        }
    };

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-test-'));
        indexPath = path.join(tempDir, 'n8n-nodes-enriched.json');
        fs.writeFileSync(indexPath, JSON.stringify(mockIndex));
        provider = new NodeSchemaProvider(indexPath);
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should get a specific node schema', () => {
        const schema = provider.getNodeSchema('slack');
        expect(schema).toBeDefined();
        expect(schema.displayName).toBe('Slack');
    });

    test('should get node schema case-insensitively', () => {
        const schema = provider.getNodeSchema('SLACK');
        expect(schema).toBeDefined();
        expect(schema.name).toBe('slack');
    });

    test('should return null for unknown node', () => {
        const schema = provider.getNodeSchema('unknownNode');
        expect(schema).toBeNull();
    });

    test('should search for nodes by query', () => {
        const results = provider.searchNodes('sql');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('postgres');
    });

    test('should search case-insensitively', () => {
        const results = provider.searchNodes('SLACK');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('slack');
    });

    test('should list all nodes', () => {
        const list = provider.listAllNodes();
        expect(list).toHaveLength(2);
        expect(list.some(n => n.name === 'slack')).toBe(true);
        expect(list.some(n => n.name === 'postgres')).toBe(true);
    });
});
