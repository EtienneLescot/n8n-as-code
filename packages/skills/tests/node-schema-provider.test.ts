import { NodeSchemaProvider } from '../src/services/node-schema-provider';
import { TypeScriptFormatter } from '../src/services/typescript-formatter';
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

describe('NodeSchemaProvider - synthesized tool variants', () => {
    let tempDir: string;
    let indexPath: string;

    const mockIndex = {
        nodes: {
            googleSheets: {
                name: 'googleSheets',
                displayName: 'Google Sheets',
                description: 'Read, update and append spreadsheet data',
                type: 'n8n-nodes-base.googleSheets',
                version: [1, 2],
                usableAsTool: true,
                group: ['transform'],
                schema: {
                    properties: [
                        {
                            name: 'resource',
                            type: 'options',
                            options: [{ value: 'sheet' }],
                        },
                        {
                            name: 'operation',
                            type: 'options',
                            options: [{ value: 'append' }],
                        },
                        { name: 'documentId', type: 'string', required: true },
                        { name: 'sheetName', type: 'string', required: true }
                    ],
                    sourcePath: '/virtual/googleSheets.node.js'
                },
                metadata: {
                    keywords: ['google', 'sheets', 'spreadsheet'],
                    operations: ['append', 'read'],
                    useCases: ['sync spreadsheet data'],
                    keywordScore: 30,
                    hasDocumentation: true,
                    markdownUrl: null,
                    markdownFile: null,
                }
            }
        }
    };

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-synthetic-tool-test-'));
        indexPath = path.join(tempDir, 'n8n-nodes-technical.json');
        fs.writeFileSync(indexPath, JSON.stringify(mockIndex));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('should synthesize a tool variant from any usableAsTool base node', () => {
        const provider = new NodeSchemaProvider(indexPath);
        const schema = provider.getNodeSchema('googleSheetsTool');

        expect(schema).toBeDefined();
        expect(schema?.name).toBe('googleSheetsTool');
        expect(schema?.type).toBe('n8n-nodes-base.googleSheetsTool');
        expect(schema?.displayName).toBe('Google Sheets Tool');
        expect(schema?.schema?.properties.some((prop: any) => prop.name === 'descriptionType')).toBe(true);
        expect(schema?.schema?.properties.some((prop: any) => prop.name === 'toolDescription')).toBe(true);
    });

    test('should resolve singular tool aliases generically', () => {
        const provider = new NodeSchemaProvider(indexPath);
        const schema = provider.getNodeSchema('googleSheetTool');

        expect(schema).toBeDefined();
        expect(schema?.name).toBe('googleSheetsTool');
    });

    test('should rank the synthesized tool variant ahead of the base node', () => {
        const provider = new NodeSchemaProvider(indexPath);
        const results = provider.searchNodes('googleSheetTool', 5);

        expect(results[0]?.name).toBe('googleSheetsTool');
        expect(results.some((result) => result.name === 'googleSheets')).toBe(true);
    });
});

// ─── TypeScriptFormatter — nested fixedcollection support ──────────────────────

describe('TypeScriptFormatter — nested fixedcollection', () => {
    /**
     * Simulates the `formFields` fixedcollection of the Wait node, which contains
     * a nested `fieldOptions` fixedcollection inside each row.
     * Before the fix, `mapTypeToTypeScript` produced `fieldOptions?: 'values'`
     * (treating the group name as an enum value). After the fix it must produce
     * `fieldOptions?: { values?: Array<{ option?: string }> }`.
     */
    const formFieldsProp = {
        name: 'formFields',
        type: 'fixedCollection',
        options: [
            {
                name: 'values',
                displayName: 'Values',
                values: [
                    { name: 'fieldName', type: 'string' },
                    {
                        name: 'fieldType',
                        type: 'options',
                        options: [
                            { value: 'text' },
                            { value: 'dropdown' },
                            { value: 'textarea' },
                        ],
                    },
                    {
                        // nested fixedcollection: fieldOptions inside formFields
                        name: 'fieldOptions',
                        type: 'fixedCollection',
                        options: [
                            {
                                name: 'values',
                                values: [{ name: 'option', type: 'string' }],
                            },
                        ],
                    },
                    { name: 'requiredField', type: 'boolean' },
                ],
            },
        ],
    };

    test('mapTypeToTypeScript: fieldOptions should show nested object type, not group name as string literal', () => {
        const tsType = (TypeScriptFormatter as any).mapTypeToTypeScript(formFieldsProp);
        // Must NOT produce `fieldOptions?: 'values'` (group name treated as enum)
        expect(tsType).not.toContain("'values'");
        // Must produce the nested structure
        expect(tsType).toContain('fieldOptions?:');
        expect(tsType).toContain('option?:');
    });

    test('mapTypeToTypeScript: options type shows ALL enum values without | string', () => {
        // fieldType has 12 valid values; we must show all of them — no slice, no | string
        const optionsProp = {
            name: 'fieldType',
            type: 'options',
            options: [
                { value: 'checkbox' }, { value: 'html' }, { value: 'date' },
                { value: 'dropdown' }, { value: 'email' }, { value: 'file' },
                { value: 'hiddenField' }, { value: 'number' }, { value: 'password' },
                { value: 'radio' }, { value: 'text' }, { value: 'textarea' },
            ],
        };
        const tsType = (TypeScriptFormatter as any).mapTypeToTypeScript(optionsProp);
        // All 12 values must appear
        expect(tsType).toContain("'text'");
        expect(tsType).toContain("'textarea'");
        expect(tsType).toContain("'checkbox'");
        // No | string escape hatch (options is a strict enum)
        expect(tsType).not.toContain('| string');
    });

    test('expandFixedCollectionValue: fieldOptions should show { values: [...] } structure', () => {
        const expanded = TypeScriptFormatter.expandFixedCollectionValue(formFieldsProp, '  ');
        // Must NOT produce a plain empty object for fieldOptions
        expect(expanded).not.toMatch(/fieldOptions:\s*'?values'?,/);
        // Must contain the nested values key
        expect(expanded).toContain('values: [');
        // The option field inside fieldOptions must appear
        expect(expanded).toContain('option:');
    });
});
