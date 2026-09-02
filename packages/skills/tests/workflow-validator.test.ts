import { jest } from '@jest/globals';
import { WorkflowValidator } from '../src/services/workflow-validator.js';
import { NodeSchemaProvider } from '../src/services/node-schema-provider.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

describe('WorkflowValidator', () => {
    let validator: WorkflowValidator;

    beforeAll(() => {
        // Use the controlled test fixture
        const indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        validator = new WorkflowValidator(indexPath);
    });

    it('should validate a simple valid workflow', async () => {
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'Start',
                    type: 'n8n-nodes-base.start',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {}
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
    });

    it('should NOT fail if node ID is missing (Warning only)', async () => {
        const workflow = {
            nodes: [
                {
                    name: 'MyNode',
                    type: 'n8n-nodes-base.httpRequest',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {
                        url: 'https://example.com'
                    }
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true); // Should still be valid!
        expect(result.errors.length).toBe(0);
        expect(result.warnings.some(w => w.message.includes('id'))).toBe(true);
    });

    it('should fail if required parameters are missing', async () => {
        const workflow = {
            nodes: [
                {
                    name: 'HTTP Request',
                    type: 'n8n-nodes-base.httpRequest',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {} // Missing 'url'
                }
            ],
            connections: {}
        };

        // Hack to make the validator work without changing source code:
        // The validator expects { properties: [] } but provider returns { schema: { properties: [] } }
        // We mock the provider to return the flattened structure the validator currently expects
        const originalNodeSchema = validator['provider'].getNodeSchema('httpRequest');
        jest.spyOn(validator['provider'], 'getNodeSchema').mockReturnValue({
            ...originalNodeSchema,
            properties: originalNodeSchema?.schema?.properties
        });

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('url'))).toBe(true);

        // Restore the mock to avoid affecting other tests
        jest.restoreAllMocks();
    });

    it('should accept community nodes with warnings', async () => {
        const workflow = {
            id: "TzEtubhefGzgsw1sPxhRH",
            name: "My workflow 2",
            nodes: [
                {
                    parameters: {},
                    type: "n8n-nodes-base.manualTrigger",
                    typeVersion: 1,
                    position: [0, 0],
                    name: "When clicking 'Execute workflow'"
                },
                {
                    parameters: {
                        options: {}
                    },
                    type: "@tavily/n8n-nodes-tavily.tavily",
                    typeVersion: 1,
                    position: [320, 16],
                    name: "Search",
                    credentials: {
                        tavilyApi: {
                            id: "yPJ1hAXQLB3rwHcW",
                            name: "Tavily account"
                        }
                    }
                }
            ],
            connections: {
                "When clicking 'Execute workflow'": {
                    main: [
                        [
                            {
                                node: "Search",
                                type: "main",
                                index: 0
                            }
                        ]
                    ]
                }
            },
            settings: {},
            tags: [],
            active: false
        };

        const result = await validator.validateWorkflow(workflow);

        // Workflow should be VALID
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);

        // But should have warnings about the community node
        expect(result.warnings.some(w =>
            w.message.includes('Community node') &&
            w.message.includes('@tavily/n8n-nodes-tavily.tavily')
        )).toBe(true);
    });

    it('does not flag parameters when the schema declares no properties', async () => {
        // A schema with an empty property list carries no information about what is known —
        // that is how a custom-node override opts out of parameter validation.
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'Start',
                    type: 'n8n-nodes-base.start',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: { whatever: true }
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true);
        expect(result.warnings.filter(w => w.message.includes('Unknown parameter'))).toEqual([]);
    });

    // Regression: the validator used to truncate node.type to its last dot-segment, so
    // "@n8n/n8n-nodes-langchain.code" was validated against "n8n-nodes-base.code".
    it('validates a LangChain node against its own schema when a base node shares the short name', async () => {
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'LLM',
                    type: '@n8n/n8n-nodes-langchain.code',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: { code: {}, inputs: {}, outputs: {} }
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true);
        expect(result.warnings.filter(w => w.message.includes('Unknown parameter'))).toEqual([]);
    });

    it('still resolves the base node for its own full type', async () => {
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'Code',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [0, 0],
                    parameters: { mode: 'runOnceForAllItems', jsCode: 'return items;' }
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true);
        expect(result.warnings.filter(w => w.message.includes('Unknown parameter'))).toEqual([]);
    });
});

describe('WorkflowValidator - custom nodes', () => {
    let tempDir: string;
    let indexPath: string;
    let customNodesPath: string;

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-custom-test-'));
        indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        customNodesPath = path.join(tempDir, 'n8nac-custom-nodes.json');

        const customNodes = {
            nodes: {
                myCustomNode: {
                    name: 'myCustomNode',
                    displayName: 'My Custom Node',
                    description: 'A proprietary custom node',
                    type: 'n8n-nodes-custom.myCustomNode',
                    version: 1,
                    schema: {
                        properties: [
                            { name: 'endpoint', type: 'string', required: true }
                        ]
                    }
                }
            }
        };
        fs.writeFileSync(customNodesPath, JSON.stringify(customNodes));
    });

    afterAll(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should accept a custom node without errors when custom nodes file is provided', async () => {
        const validator = new WorkflowValidator(indexPath, customNodesPath);
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'Trigger',
                    type: 'n8n-nodes-base.manualTrigger',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: {}
                },
                {
                    id: '2',
                    name: 'MyCustom',
                    type: 'n8n-nodes-custom.myCustomNode',
                    typeVersion: 1,
                    position: [200, 0],
                    parameters: { endpoint: 'https://api.example.com' }
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.errors.length).toBe(0);
        expect(result.valid).toBe(true);
        // Should NOT warn about unknown node type
        expect(result.warnings.some(w => w.message.includes('not in the schema'))).toBe(false);
    });

    it('should emit a community-node warning (not an error) for custom node type when no sidecar file is provided', async () => {
        // n8n-nodes-custom.* matches the community node heuristic (n8n-nodes-* without
        // n8n-nodes-base.* / n8n-nodes-langchain.*), so the validator emits a warning and
        // keeps the workflow valid — parameter validation is simply skipped for that node.
        const validator = new WorkflowValidator(indexPath);
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'MyCustom',
                    type: 'n8n-nodes-custom.myCustomNode',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: {}
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        // Without a custom nodes file the type is treated as a community node → warning only
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
        expect(result.warnings.some(w => w.message.includes('not in the schema'))).toBe(true);
    });

    // Regression: `n8nac push --verify` builds the validator without paths, which used to
    // ignore the sidecar entirely.
    it('resolves the sidecar from the project directory when no path is passed', async () => {
        const previousCwd = process.cwd();
        process.chdir(tempDir);
        try {
            const validator = new WorkflowValidator(indexPath);
            const workflow = {
                nodes: [
                    {
                        id: '1',
                        name: 'MyCustom',
                        type: 'n8n-nodes-custom.myCustomNode',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: { endpoint: 'https://api.example.com' }
                    }
                ],
                connections: {}
            };

            const result = await validator.validateWorkflow(workflow);
            expect(result.errors.length).toBe(0);
            expect(result.warnings.some(w => w.message.includes('not in the schema'))).toBe(false);
        } finally {
            process.chdir(previousCwd);
        }
    });

    it('should validate required parameters from custom node schema', async () => {
        const validator = new WorkflowValidator(indexPath, customNodesPath);
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'MyCustom',
                    type: 'n8n-nodes-custom.myCustomNode',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: {} // Missing required 'endpoint'
                }
            ],
            connections: {}
        };

        const result = await validator.validateWorkflow(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('endpoint'))).toBe(true);
    });
});

describe('WorkflowValidator - nested parameter validation', () => {
    const createValidatorWithNodeSchema = (nodeSchema: any): WorkflowValidator => {
        const indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        const validator = new WorkflowValidator(indexPath);
        jest.spyOn(validator['provider'], 'getNodeSchema').mockReturnValue(nodeSchema);
        return validator;
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('honors displayOptions.hide when checking required parameters', async () => {
        const validator = createValidatorWithNodeSchema({
            name: 'postgres',
            type: 'n8n-nodes-base.postgres',
            version: 1,
            schema: {
                properties: [
                    {
                        name: 'operation',
                        type: 'options',
                        options: [{ name: 'Execute Query', value: 'executeQuery' }],
                        required: true,
                    },
                    {
                        name: 'query',
                        type: 'string',
                        required: true,
                        displayOptions: { show: { operation: ['executeQuery'] } },
                    },
                    {
                        name: 'schema',
                        type: 'string',
                        required: true,
                        displayOptions: { hide: { operation: ['executeQuery'] } },
                    },
                    {
                        name: 'table',
                        type: 'string',
                        required: true,
                        displayOptions: { hide: { operation: ['executeQuery'] } },
                    },
                ],
            },
        });

        const result = await validator.validateWorkflow({
            nodes: [
                {
                    id: '1',
                    name: 'Postgres',
                    type: 'n8n-nodes-base.postgres',
                    typeVersion: 1,
                    position: [0, 0],
                    parameters: {
                        operation: 'executeQuery',
                        query: 'select 1',
                    },
                },
            ],
            connections: {},
        });

        expect(result.valid).toBe(true);
        expect(result.errors.map(e => e.message)).not.toContain('Missing required parameter: "schema"');
        expect(result.errors.map(e => e.message)).not.toContain('Missing required parameter: "table"');
    });

    it('recurses into fixedCollection items and catches missing Switch filter options', async () => {
        const validator = createValidatorWithNodeSchema({
            name: 'switch',
            type: 'n8n-nodes-base.switch',
            version: 3.2,
            schema: {
                properties: [
                    {
                        name: 'mode',
                        type: 'options',
                        options: [{ name: 'Rules', value: 'rules' }],
                    },
                    {
                        name: 'rules',
                        type: 'fixedCollection',
                        displayOptions: { show: { mode: ['rules'] } },
                        default: {
                            values: [
                                {
                                    conditions: {
                                        options: {
                                            caseSensitive: true,
                                            typeValidation: 'strict',
                                        },
                                        conditions: [
                                            {
                                                leftValue: '',
                                                rightValue: '',
                                                operator: {
                                                    type: 'string',
                                                    operation: 'equals',
                                                },
                                            },
                                        ],
                                        combinator: 'and',
                                    },
                                },
                            ],
                        },
                        options: [
                            {
                                name: 'values',
                                displayName: 'Routing Rule',
                                values: [
                                    {
                                        name: 'conditions',
                                        type: 'filter',
                                        default: {},
                                        typeOptions: {
                                            filter: {
                                                caseSensitive: '={{!$parameter.options.ignoreCase}}',
                                                typeValidation: 'strict',
                                            },
                                        },
                                    },
                                    {
                                        name: 'renameOutput',
                                        type: 'boolean',
                                        default: false,
                                    },
                                    {
                                        name: 'outputKey',
                                        type: 'string',
                                        required: true,
                                        displayOptions: { show: { renameOutput: [true] } },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        });

        const result = await validator.validateWorkflow({
            nodes: [
                {
                    id: '1',
                    name: 'Switch',
                    type: 'n8n-nodes-base.switch',
                    typeVersion: 3.2,
                    position: [0, 0],
                    parameters: {
                        mode: 'rules',
                        rules: {
                            values: [
                                {
                                    conditions: {
                                        conditions: [
                                            {
                                                leftValue: '={{ $json.state }}',
                                                operator: { type: 'string', operation: 'equals' },
                                                rightValue: 'planning',
                                            },
                                        ],
                                        combinator: 'and',
                                    },
                                    outputIndex: 0,
                                },
                            ],
                        },
                    },
                },
            ],
            connections: {},
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.path?.endsWith('.rules.values[0].conditions.options'))).toBe(true);
        expect(result.warnings.some(w => w.message.includes('outputIndex'))).toBe(false);

        const validResult = await validator.validateWorkflow({
            nodes: [
                {
                    id: '1',
                    name: 'Switch',
                    type: 'n8n-nodes-base.switch',
                    typeVersion: 3.2,
                    position: [0, 0],
                    parameters: {
                        mode: 'rules',
                        rules: {
                            values: [
                                {
                                    conditions: {
                                        options: {
                                            caseSensitive: true,
                                            typeValidation: 'strict',
                                        },
                                        conditions: [
                                            {
                                                leftValue: '={{ $json.state }}',
                                                operator: { type: 'string', operation: 'equals' },
                                                rightValue: 'planning',
                                            },
                                        ],
                                        combinator: 'and',
                                    },
                                    outputIndex: 0,
                                },
                            ],
                        },
                    },
                },
            ],
            connections: {},
        });

        expect(validResult.valid).toBe(true);
    });

    it('applies nested fixedCollection displayOptions against item parameters', async () => {
        const validator = createValidatorWithNodeSchema({
            name: 'switch',
            type: 'n8n-nodes-base.switch',
            version: 3.2,
            schema: {
                properties: [
                    {
                        name: 'rules',
                        type: 'fixedCollection',
                        default: {},
                        options: [
                            {
                                name: 'values',
                                displayName: 'Routing Rule',
                                values: [
                                    { name: 'renameOutput', type: 'boolean', default: false },
                                    {
                                        name: 'outputKey',
                                        type: 'string',
                                        required: true,
                                        displayOptions: { show: { renameOutput: [true] } },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        });

        const result = await validator.validateWorkflow({
            nodes: [
                {
                    id: '1',
                    name: 'Switch',
                    type: 'n8n-nodes-base.switch',
                    typeVersion: 3.2,
                    position: [0, 0],
                    parameters: {
                        rules: {
                            values: [
                                { renameOutput: false },
                                { renameOutput: true },
                            ],
                        },
                    },
                },
            ],
            connections: {},
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].path).toBe('nodes[Switch].parameters.rules.values[1].outputKey');
    });
});

describe('WorkflowValidator - Issue #609 false-positives', () => {
    const createValidatorWithNodeSchema = (nodeSchema: any): WorkflowValidator => {
        const indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        const validator = new WorkflowValidator(indexPath);
        jest.spyOn(validator['provider'], 'getNodeSchema').mockReturnValue(nodeSchema);
        return validator;
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('multiOptions validation', () => {
        const multiOptionsSchema = {
            name: 'webhook',
            type: 'n8n-nodes-base.webhook',
            version: 1,
            schema: {
                properties: [
                    {
                        name: 'httpMethod',
                        type: 'multiOptions',
                        options: [
                            { name: 'GET', value: 'GET' },
                            { name: 'POST', value: 'POST' },
                            { name: 'PUT', value: 'PUT' },
                            { name: 'DELETE', value: 'DELETE' },
                        ],
                    },
                ],
            },
        };

        it('passes valid multiOptions array', async () => {
            const validator = createValidatorWithNodeSchema(multiOptionsSchema);
            const result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'Webhook',
                        type: 'n8n-nodes-base.webhook',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {
                            httpMethod: ['GET', 'POST'],
                        },
                    },
                ],
                connections: {},
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects invalid array entries in multiOptions', async () => {
            const validator = createValidatorWithNodeSchema(multiOptionsSchema);
            const result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'Webhook',
                        type: 'n8n-nodes-base.webhook',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {
                            httpMethod: ['POST', 'INVALID_METHOD'],
                        },
                    },
                ],
                connections: {},
            });

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0].message).toContain('Invalid value(s) [INVALID_METHOD] for parameter "httpMethod"');
            expect(result.errors[0].path).toBe('nodes[Webhook].parameters.httpMethod');
        });
    });

    describe('ResourceLocator values', () => {
        it('skips ResourceLocator object without error', async () => {
            const validator = createValidatorWithNodeSchema({
                name: 'slack',
                type: 'n8n-nodes-base.slack',
                version: 1,
                schema: {
                    properties: [
                        {
                            name: 'channel',
                            type: 'options',
                            options: [
                                { name: 'General', value: 'general' },
                                { name: 'Random', value: 'random' },
                            ],
                        },
                    ],
                },
            });

            const result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'Slack',
                        type: 'n8n-nodes-base.slack',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {
                            channel: {
                                __rl: true,
                                value: 'C01234567',
                                mode: 'id',
                            },
                        },
                    },
                ],
                connections: {},
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });
    });

    describe('@version-scoped properties', () => {
        const versionedNodeSchema = {
            name: 'myVersionedNode',
            type: 'n8n-nodes-base.myVersionedNode',
            version: [1, 1.1, 1.2, 2],
            schema: {
                properties: [
                    {
                        name: 'operation',
                        type: 'options',
                        displayOptions: {
                            show: {
                                '@version': [1, 1.1],
                            },
                        },
                        options: [
                            { name: 'Old Op', value: 'oldOp' },
                        ],
                    },
                    {
                        name: 'operation',
                        type: 'options',
                        displayOptions: {
                            show: {
                                '@version': [{ _cnd: { gte: 2 } }],
                            },
                        },
                        options: [
                            { name: 'New Op', value: 'newOp' },
                        ],
                    },
                    {
                        name: 'legacyField',
                        type: 'string',
                        required: true,
                        displayOptions: {
                            show: {
                                '@version': { lte: 1.2 },
                            },
                        },
                    },
                ],
            },
        };

        it('does not validate newer typeVersions against obsolete version options', async () => {
            const validator = createValidatorWithNodeSchema(versionedNodeSchema);

            // typeVersion 2 with newOp is valid
            const validV2Result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'MyNode',
                        type: 'n8n-nodes-base.myVersionedNode',
                        typeVersion: 2,
                        position: [0, 0],
                        parameters: {
                            operation: 'newOp',
                        },
                    },
                ],
                connections: {},
            });
            expect(validV2Result.valid).toBe(true);
            expect(validV2Result.errors).toHaveLength(0);

            // typeVersion 2 with oldOp is invalid because oldOp is obsolete in v2
            const invalidV2Result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'MyNode',
                        type: 'n8n-nodes-base.myVersionedNode',
                        typeVersion: 2,
                        position: [0, 0],
                        parameters: {
                            operation: 'oldOp',
                        },
                    },
                ],
                connections: {},
            });
            expect(invalidV2Result.valid).toBe(false);
            expect(invalidV2Result.errors.some(e => e.message.includes('Invalid value "oldOp" for parameter "operation"'))).toBe(true);

            // typeVersion 1 with oldOp is valid (and requires legacyField because v1 <= 1.2)
            const validV1Result = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'MyNode',
                        type: 'n8n-nodes-base.myVersionedNode',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {
                            operation: 'oldOp',
                            legacyField: 'legacy-val',
                        },
                    },
                ],
                connections: {},
            });
            expect(validV1Result.valid).toBe(true);
            expect(validV1Result.errors).toHaveLength(0);

            // typeVersion 2 does NOT require legacyField because it is scoped to { lte: 1.2 }
            const legacyCheckResult = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'MyNode',
                        type: 'n8n-nodes-base.myVersionedNode',
                        typeVersion: 2,
                        position: [0, 0],
                        parameters: {
                            operation: 'newOp',
                        },
                    },
                ],
                connections: {},
            });
            expect(legacyCheckResult.errors.some(e => e.message.includes('legacyField'))).toBe(false);
        });
    });

    describe('required properties with defaults', () => {
        it('does not report an error when required: true properties with a default are omitted', async () => {
            const validator = createValidatorWithNodeSchema({
                name: 'stickyNote',
                type: 'n8n-nodes-base.stickyNote',
                version: 1,
                schema: {
                    properties: [
                        {
                            name: 'height',
                            type: 'number',
                            required: true,
                            default: 160,
                        },
                        {
                            name: 'width',
                            type: 'number',
                            required: true,
                            default: 240,
                        },
                        {
                            name: 'color',
                            type: 'number',
                            required: true,
                            default: 1,
                        },
                        {
                            name: 'title',
                            type: 'string',
                            required: true,
                            // no default
                        },
                    ],
                },
            });

            // When title is provided, height/width/color have schema defaults and are omitted -> valid!
            const validResult = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'Sticky Note',
                        type: 'n8n-nodes-base.stickyNote',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {
                            title: 'My Note',
                        },
                    },
                ],
                connections: {},
            });

            expect(validResult.valid).toBe(true);
            expect(validResult.errors).toHaveLength(0);

            // When title (which has no default) is omitted -> invalid!
            const invalidResult = await validator.validateWorkflow({
                nodes: [
                    {
                        id: '1',
                        name: 'Sticky Note',
                        type: 'n8n-nodes-base.stickyNote',
                        typeVersion: 1,
                        position: [0, 0],
                        parameters: {},
                    },
                ],
                connections: {},
            });

            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.errors).toHaveLength(1);
            expect(invalidResult.errors[0].message).toBe('Missing required parameter: "title"');
        });
    });
});

describe('WorkflowValidator - fallback model', () => {
    const createValidator = (): WorkflowValidator => {
        const indexPath = path.resolve(_dirname, 'fixtures/n8n-nodes-technical.json');
        const validator = new WorkflowValidator(indexPath);
        // Schema lookup is irrelevant here: the rule reads parameters + connections
        jest.spyOn(validator['provider'], 'getNodeSchema').mockReturnValue({
            name: 'chainLlm',
            type: '@n8n/n8n-nodes-langchain.chainLlm',
            version: 1.7,
            schema: { properties: [] },
        } as any);
        return validator;
    };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    const workflowWithFallback = (connections: any) => ({
        nodes: [
            { id: '1', name: 'Classify', type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 1.7, position: [0, 0], parameters: { needsFallback: true } },
            { id: '2', name: 'Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.7, position: [0, 200], parameters: {} },
            { id: '3', name: 'Fallback Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.7, position: [200, 200], parameters: {} },
        ],
        connections,
    });

    const aiConn = (index: number) => ({ ai_languageModel: [[{ node: 'Classify', type: 'ai_languageModel', index }]] });

    it('rejects needsFallback: true without a model on input 1', async () => {
        const result = await createValidator().validateWorkflow(workflowWithFallback({ 'Model': aiConn(0) }));
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('needsFallback'))).toBe(true);
    });

    it('accepts needsFallback: true when a fallback model is wired to input 1', async () => {
        const result = await createValidator().validateWorkflow(
            workflowWithFallback({ 'Model': aiConn(0), 'Fallback Model': aiConn(1) })
        );
        expect(result.errors.some(e => e.message.includes('needsFallback'))).toBe(false);
        expect(result.valid).toBe(true);
    });

    it('rejects needsFallback: true when the fallback model is disabled', async () => {
        const workflow = workflowWithFallback({ 'Model': aiConn(0), 'Fallback Model': aiConn(1) });
        workflow.nodes[2].disabled = true;
        const result = await createValidator().validateWorkflow(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('needsFallback'))).toBe(true);
    });

    it('reports malformed ai_languageModel connections even with a valid fallback slot', async () => {
        const result = await createValidator().validateWorkflow(
            workflowWithFallback({
                'Model': { ai_languageModel: [[{ node: 'Classify', type: 'ai_languageModel', index: 0 }], 'not-an-array'] },
                'Fallback Model': aiConn(1),
            })
        );
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Malformed ai_languageModel connection group'))).toBe(true);
        // The fallback slot itself is valid, so the needsFallback rule must not fire.
        expect(result.errors.some(e => e.message.includes('needsFallback'))).toBe(false);
    });

    it('reports ai_languageModel connections with an invalid node field', async () => {
        const result = await createValidator().validateWorkflow(
            workflowWithFallback({ 'Model': { ai_languageModel: [[{ type: 'ai_languageModel', index: 0 }]] }, 'Fallback Model': aiConn(1) })
        );
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('Malformed ai_languageModel connection on node "Model"'))).toBe(true);
    });
});
