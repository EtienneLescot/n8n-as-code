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

describe('NodeSchemaProvider - custom nodes', () => {
    let tempDir: string;
    let indexPath: string;
    let customNodesPath: string;

    const mockIndex = {
        nodes: {
            slack: {
                name: 'slack',
                displayName: 'Slack',
                description: 'Send Slack messages',
                version: 1,
                schema: { properties: [] }
            }
        }
    };

    const customNodes = {
        nodes: {
            myCustomNode: {
                name: 'myCustomNode',
                displayName: 'My Custom Node',
                description: 'A proprietary custom node',
                type: 'n8n-nodes-custom.myCustomNode',
                version: 1,
                schema: { properties: [] }
            }
        }
    };

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-custom-test-'));
        indexPath = path.join(tempDir, 'n8n-nodes-technical.json');
        customNodesPath = path.join(tempDir, 'n8nac-custom-nodes.json');
        fs.writeFileSync(indexPath, JSON.stringify(mockIndex));
        fs.writeFileSync(customNodesPath, JSON.stringify(customNodes));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should find official node when custom nodes are provided', () => {
        const provider = new NodeSchemaProvider(indexPath, customNodesPath);
        const schema = provider.getNodeSchema('slack');
        expect(schema).toBeDefined();
        expect(schema.displayName).toBe('Slack');
    });

    test('should find custom node merged from custom nodes file', () => {
        const provider = new NodeSchemaProvider(indexPath, customNodesPath);
        const schema = provider.getNodeSchema('myCustomNode');
        expect(schema).toBeDefined();
        expect(schema.displayName).toBe('My Custom Node');
    });

    test('custom node should appear in listAllNodes()', () => {
        const provider = new NodeSchemaProvider(indexPath, customNodesPath);
        const list = provider.listAllNodes();
        expect(list.some(n => n.name === 'myCustomNode')).toBe(true);
        expect(list.some(n => n.name === 'slack')).toBe(true);
    });

    test('custom node should be findable via searchNodes()', () => {
        const provider = new NodeSchemaProvider(indexPath, customNodesPath);
        const results = provider.searchNodes('custom');
        expect(results.some(r => r.name === 'myCustomNode')).toBe(true);
    });

    test('custom node should override official node with same key', () => {
        const overrideNodes = {
            nodes: {
                slack: {
                    name: 'slack',
                    displayName: 'Slack (custom version)',
                    description: 'Overridden Slack node',
                    version: 99,
                    schema: { properties: [] }
                }
            }
        };
        const overridePath = path.join(tempDir, 'n8nac-override-nodes.json');
        fs.writeFileSync(overridePath, JSON.stringify(overrideNodes));

        const provider = new NodeSchemaProvider(indexPath, overridePath);
        const schema = provider.getNodeSchema('slack');
        expect(schema).toBeDefined();
        expect(schema.displayName).toBe('Slack (custom version)');
    });

    test('should work normally when custom nodes file does not exist', () => {
        const provider = new NodeSchemaProvider(indexPath, '/nonexistent/path/custom-nodes.json');
        const schema = provider.getNodeSchema('slack');
        expect(schema).toBeDefined();
        expect(schema.displayName).toBe('Slack');
        // Custom node should NOT be found
        const missing = provider.getNodeSchema('myCustomNode');
        expect(missing).toBeNull();
    });

    test('should throw when custom nodes file is malformed JSON', () => {
        const badPath = path.join(tempDir, 'bad-custom-nodes.json');
        fs.writeFileSync(badPath, 'not valid json {{{');
        const provider = new NodeSchemaProvider(indexPath, badPath);
        expect(() => provider.getNodeSchema('slack')).toThrow(/Failed to load custom nodes file/);
    });

    test('should throw when custom nodes file does not contain a top-level nodes object', () => {
        const badShapePath = path.join(tempDir, 'bad-shape-custom-nodes.json');
        fs.writeFileSync(badShapePath, JSON.stringify({ customNodes: {} }));
        const provider = new NodeSchemaProvider(indexPath, badShapePath);
        expect(() => provider.getNodeSchema('slack')).toThrow(/top-level "nodes" object/);
    });

    test('should expose diagnostics for merged custom nodes', () => {
        const provider = new NodeSchemaProvider(indexPath, customNodesPath);
        const diagnostics = provider.getDiagnostics();

        expect(diagnostics.customNodesLoaded).toBe(true);
        expect(diagnostics.officialNodeCount).toBe(1);
        expect(diagnostics.customNodeCount).toBe(1);
        expect(diagnostics.totalNodeCount).toBe(2);
        expect(diagnostics.customNodeKeys).toContain('myCustomNode');
    });
});
