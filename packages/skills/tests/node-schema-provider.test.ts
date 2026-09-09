import { NodeSchemaProvider, resolveNode, suggestNodes } from '../src/services/node-schema-provider';
import { TypeScriptFormatter } from '../src/services/typescript-formatter';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

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

    test('generateCompactNodeDoc: carries the resource and operation discriminators', () => {
        // Without them the snippet body was an empty placeholder, so an authoring agent
        // paid a second full lookup per node and compact cost a round trip.
        const doc = TypeScriptFormatter.generateCompactNodeDoc({
            name: 'gmail',
            type: 'n8n-nodes-base.gmail',
            displayName: 'Gmail',
            description: 'Work with Gmail',
            version: 2.2,
            properties: [
                { name: 'resource', type: 'options', options: [{ value: 'message' }, { value: 'draft' }] },
                { name: 'operation', type: 'options', displayOptions: { show: { resource: ['draft'] } }, options: [{ value: 'create' }] },
                { name: 'operation', type: 'options', displayOptions: { show: { resource: ['message'] } }, options: [{ value: 'send' }, { value: 'getAll' }] },
            ],
        });

        expect(doc).toContain("resource: 'message'");
        expect(doc).toContain('operation:');
        expect(doc).not.toContain('/* parameters */');
    });

    test('generateCompactNodeDoc: unions options across displayOptions variants', () => {
        // n8n splits `operation` into one property per resource. Reading only the first
        // advertised draft's values as gmail's whole set, hiding `send`, and an agent
        // picked a wrong operation on that basis.
        const doc = TypeScriptFormatter.generateCompactNodeDoc({
            name: 'gmail',
            type: 'n8n-nodes-base.gmail',
            displayName: 'Gmail',
            description: 'Work with Gmail',
            version: 2.2,
            properties: [
                { name: 'resource', type: 'options', options: [{ value: 'draft' }, { value: 'message' }] },
                { name: 'operation', type: 'options', displayOptions: { show: { resource: ['draft'] } }, options: [{ value: 'create' }] },
                { name: 'operation', type: 'options', displayOptions: { show: { resource: ['message'] } }, options: [{ value: 'send' }] },
            ],
        });

        expect(doc).toContain('draft: create');
        expect(doc).toContain('message: send');
    });

    test('mapTypeToTypeScript: resourceLocator produces strict __rl object type', () => {
        const rlProp = {
            name: 'sheetId',
            type: 'resourceLocator',
        };
        const tsType = (TypeScriptFormatter as any).mapTypeToTypeScript(rlProp);
        expect(tsType).toContain('__rl: true');
        expect(tsType).toContain('value: string');
        expect(tsType).toContain('mode:');
    });

    test('generateDefaultValue: resourceLocator produces __rl object structure', () => {
        const rlProp = {
            name: 'sheetId',
            type: 'resourceLocator',
        };
        const defVal = (TypeScriptFormatter as any).generateDefaultValue(rlProp);
        expect(defVal).toContain('__rl: true');
        expect(defVal).toContain("mode: 'list'");
    });

});

/**
 * `resolveNode` decides what `n8nac skills node-info` and the MCP `get_n8n_node_info` treat
 * as "the node you asked for". It used to gate the fuzzy fallback on `searchNodes`'
 * relevance score, which is unbounded and not a similarity measure: `zzzznotanode` scored
 * 133 against `vectorStoreWeaviate` and sailed past the threshold, so every miss became a
 * confident wrong node. It is judged on the name now.
 */
const ontology = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/assets/n8n-nodes-technical.json',
);
const describeWithOntology = fs.existsSync(ontology) ? describe : describe.skip;

describeWithOntology('resolveNode', () => {
    let real: NodeSchemaProvider;
    beforeAll(() => { real = new NodeSchemaProvider(ontology); });

    test.each([
        ['gmail', 'gmail'],
        ['googleSheets', 'googleSheets'],
        ['webhook', 'webhook'],
        // The display name and the camelCase spelling normalize to the same thing.
        ['sendEmail', 'emailSend'],
    ])('resolves %s exactly', (query, expected) => {
        const resolution = resolveNode(real, query);
        expect(resolution?.matchedName).toBe(expected);
        expect(resolution?.exact).toBe(true);
    });

    test.each([
        ['slackk', 'slack'],            // typo
        ['httpReq', 'httpRequest'],     // abbreviation
        ['sheets', 'googleSheets'],     // partial name, shortest candidate wins
        ['postgresql', 'postgres'],     // the search engine ranked vectorStorePGVector first
    ])('resolves %s to %s and says it was inexact', (query, expected) => {
        const resolution = resolveNode(real, query);
        expect(resolution?.matchedName).toBe(expected);
        expect(resolution?.exact).toBe(false);
    });

    test.each(['zzzznotanode', 'xyzzy-plugh'])(
        'refuses to invent a node for %s',
        (query) => {
            expect(resolveNode(real, query)).toBeUndefined();
        },
    );

    test('a miss still offers somewhere to go next', () => {
        expect(suggestNodes(real, 'zzzznotanode').length).toBeGreaterThan(0);
    });

    test('a prefixed type name is the same node, not a fuzzy hit', () => {
        const resolution = resolveNode(real, 'n8n-nodes-base.googleSheets');
        expect(resolution?.exact).toBe(true);
    });

    // The guard is the property itself: a display name is one of the node's official
    // spellings, so resolving by it must land on that node — exactly, not on the parent
    // node whose name it contains (`Slack Trigger` -> `slack`) and not on a miss.
    test('every display name in the ontology resolves to its own node', () => {
        const ontologyJson = JSON.parse(fs.readFileSync(ontology, 'utf-8'));
        // Two display names are each borne by two nodes; resolving by them may return either.
        const ownersByDisplayName = new Map<string, string[]>();
        for (const node of Object.values<any>(ontologyJson.nodes)) {
            ownersByDisplayName.set(node.displayName,
                [...(ownersByDisplayName.get(node.displayName) || []), node.name]);
        }
        const problems: string[] = [];
        for (const [displayName, owners] of ownersByDisplayName) {
            const resolution = resolveNode(real, displayName);
            if (!resolution) {
                problems.push(`${displayName}: not found`);
            } else if (!resolution.exact) {
                problems.push(`${displayName}: inexact (${resolution.matchedName})`);
            } else if (!owners.includes(resolution.matchedName)) {
                problems.push(`${displayName}: resolved to ${resolution.matchedName}`);
            }
        }
        expect(problems.join(' | ')).toBe('');
    });
});
