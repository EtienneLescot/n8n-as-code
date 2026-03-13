/**
 * Tests for JSON to TypeScript transformation
 */

import { describe, it, expect } from 'vitest';
import { JsonToAstParser } from '../src/parser/json-to-ast.js';
import { AstToTypeScriptGenerator } from '../src/parser/ast-to-typescript.js';
import { TypeScriptParser } from '../src/compiler/typescript-parser.js';
import { WorkflowBuilder } from '../src/compiler/workflow-builder.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('JSON to TypeScript Transformation', () => {
    it('should parse simple workflow JSON to AST', () => {
        const workflowJson = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'fixtures/simple-workflow.json'), 'utf-8')
        );
        
        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson);
        
        // Verify metadata
        expect(ast.metadata.id).toBe('test-workflow-123');
        expect(ast.metadata.name).toBe('Simple Test Workflow');
        expect(ast.metadata.active).toBe(true);
        
        // Verify nodes
        expect(ast.nodes).toHaveLength(3);
        expect(ast.nodes[0].propertyName).toBe('ScheduleTrigger');
        expect(ast.nodes[1].propertyName).toBe('HttpRequest');
        expect(ast.nodes[2].propertyName).toBe('SetVariables');
        
        // Verify connections
        expect(ast.connections).toHaveLength(2);
        expect(ast.connections[0].from.node).toBe('ScheduleTrigger');
        expect(ast.connections[0].to.node).toBe('HttpRequest');
        expect(ast.connections[1].from.node).toBe('HttpRequest');
        expect(ast.connections[1].to.node).toBe('SetVariables');
    });
    
    it('should generate TypeScript code from AST', async () => {
        const workflowJson = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'fixtures/simple-workflow.json'), 'utf-8')
        );
        
        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson);
        
        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false, // Disable Prettier for test
            commentStyle: 'minimal'
        });
        
        // Verify imports
        expect(tsCode).toContain("import { workflow, node, links } from '@n8n-as-code/transformer'");
        
        // Verify @workflow decorator
        expect(tsCode).toContain('@workflow(');
        expect(tsCode).toContain('id: "test-workflow-123"');
        expect(tsCode).toContain('name: "Simple Test Workflow"');
        
        // Verify @node decorators
        expect(tsCode).toContain('@node(');
        expect(tsCode).toContain('ScheduleTrigger =');
        expect(tsCode).toContain('HttpRequest =');
        expect(tsCode).toContain('SetVariables =');
        
        // Verify connections
        expect(tsCode).toContain('@links()');
        expect(tsCode).toContain('defineRouting()');
        expect(tsCode).toContain('this.ScheduleTrigger.out(0).to(this.HttpRequest.in(0))');
        expect(tsCode).toContain('this.HttpRequest.out(0).to(this.SetVariables.in(0))');
    });

    it('should emit [ai_*] flags for AI sub-nodes in the workflow-map NODE INDEX', async () => {
        const tsCode = `
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'ai-test', name: 'AI Test', active: false })
export class AiTestWorkflow {
    @node({ name: 'Trigger', type: 'n8n-nodes-base.manualTrigger', version: 1, position: [0, 0] })
    Trigger = {};

    @node({ name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', version: 1, position: [200, 0] })
    Agent = {};

    @node({ name: 'Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', version: 1, position: [200, 200] })
    Model = {};

    @node({ name: 'Memory', type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: 1, position: [300, 200] })
    Memory = {};

    @node({ name: 'Tool', type: 'n8n-nodes-base.httpRequestTool', version: 1, position: [400, 200] })
    Tool = {};

    @links()
    defineRouting() {
        this.Trigger.out(0).to(this.Agent.in(0));
        this.Agent.uses({
            ai_languageModel: this.Model.output,
            ai_memory: this.Memory.output,
            ai_tool: [this.Tool.output],
        });
    }
}`;

        const parser = new TypeScriptParser();
        const ast = await parser.parseCode(tsCode);

        const generator = new AstToTypeScriptGenerator();
        const output = await generator.generate(ast, { format: false });

        // Consumer node should have [AI] flag
        expect(output).toMatch(/\/\/ Agent\s+agent\s+\[AI\]/);

        // Sub-nodes should have their [ai_*] role flags
        expect(output).toMatch(/\/\/ Model\s+lmChatOpenAi\s+\[ai_languageModel\]/);
        expect(output).toMatch(/\/\/ Memory\s+memoryBufferWindow\s+\[ai_memory\]/);
        expect(output).toMatch(/\/\/ Tool\s+httpRequestTool\s+\[ai_tool\]/);

        // Regular trigger should have no AI flags
        expect(output).not.toMatch(/\/\/ Trigger\s+manualTrigger\s+\[/);

        // AI CONNECTIONS section: consumer node calls .uses(), sub-nodes are values
        // Correct:   Agent.uses({ ai_languageModel: Model, ai_memory: Memory, ai_tool: [Tool] })
        // Incorrect: Model.uses({ ai_languageModel: Agent })  ← was the old inverted bug
        expect(output).toContain('// Agent.uses({ ai_languageModel: Model, ai_memory: Memory, ai_tool: [Tool] })');
        expect(output).not.toContain('// Model.uses(');
        expect(output).not.toContain('// Memory.uses(');
        expect(output).not.toContain('// Tool.uses(');
    });

    it('should preserve webhookId in node decorator metadata', async () => {
        const workflowJson = {
            id: 'wf-webhook-1',
            name: 'Webhook Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-webhook-1',
                    webhookId: 'wh_123456',
                    name: 'Webhook',
                    type: 'n8n-nodes-base.webhook',
                    typeVersion: 2,
                    position: [100, 200],
                    parameters: {
                        httpMethod: 'POST',
                        path: 'incoming'
                    }
                }
            ],
            connections: {},
            settings: {}
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson);
        expect(ast.nodes[0].webhookId).toBe('wh_123456');

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false,
            commentStyle: 'minimal'
        });

        expect(tsCode).toContain('webhookId: "wh_123456"');
    });

    it('should escape quoted names in generated decorator metadata and preserve them on reparse', async () => {
        const workflowJson = {
            id: 'wf-quotes-1',
            name: 'Workflow "Quotes"',
            active: false,
            nodes: [
                {
                    id: 'node-quotes-1',
                    name: 'Save "Rencontre" in Pipedrive',
                    type: 'n8n-nodes-base.executeWorkflow',
                    typeVersion: 1.3,
                    position: [1280, 5872],
                    parameters: {},
                    onError: 'continueRegularOutput',
                },
            ],
            connections: {},
            settings: {},
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson as any);

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false,
            commentStyle: 'minimal',
        });

        expect(tsCode).toContain('name: "Workflow \\"Quotes\\""');
        expect(tsCode).toContain('name: "Save \\"Rencontre\\" in Pipedrive"');
        expect(tsCode).toContain('onError: "continueRegularOutput"');

        const tsParser = new TypeScriptParser();
        const reparsedAst = await tsParser.parseCode(tsCode);

        expect(reparsedAst.metadata.name).toBe('Workflow "Quotes"');
        expect(reparsedAst.nodes[0].displayName).toBe('Save "Rencontre" in Pipedrive');
        expect(reparsedAst.nodes[0].onError).toBe('continueRegularOutput');
    });

    it('should include workflow tags in generated TypeScript metadata', async () => {
        const workflowJson = {
            id: 'wf-tags-1',
            name: 'Tagged Workflow',
            active: false,
            tags: [
                { id: 'tag-1', name: 'ops' },
                { id: 'tag-2', name: 'production' }
            ],
            nodes: [],
            connections: {},
            settings: {}
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson as any);

        expect(ast.metadata.tags).toEqual(['ops', 'production']);

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false,
            commentStyle: 'minimal'
        });

        expect(tsCode).toContain('tags: ["ops","production"]');
    });

    it('should emit multiline strings as template literals for readable jsCode', async () => {
        const workflowJson = {
            id: 'wf-code-1',
            name: 'Code Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-code-1',
                    name: 'Code',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [100, 200],
                    parameters: {
                        jsCode: "const template = `Hello ${name}`;\nreturn `value: ${template}`;",
                    },
                },
            ],
            connections: {},
            settings: {},
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson as any);

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false,
            commentStyle: 'minimal',
        });

        expect(tsCode).toContain(
            'jsCode: `const template = \\`Hello \\${name}\\`;\nreturn \\`value: \\${template}\\`;`'
        );
        expect(tsCode).not.toContain('jsCode: "const template');
    });

    it('should preserve node execution settings through JSON → AST → TypeScript', async () => {
        const workflowJson = {
            id: 'wf-exec-1',
            name: 'Exec Settings Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-exec-1',
                    name: 'Data Table',
                    type: 'n8n-nodes-base.set',
                    typeVersion: 3,
                    position: [100, 200],
                    parameters: { mode: 'manual' },
                    alwaysOutputData: true,
                    executeOnce: false,
                    retryOnFail: true,
                    maxTries: 5,
                    waitBetweenTries: 2000,
                },
            ],
            connections: {},
            settings: {},
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson as any);

        // Verify AST captures the execution settings
        expect(ast.nodes[0].alwaysOutputData).toBe(true);
        expect(ast.nodes[0].executeOnce).toBe(false);
        expect(ast.nodes[0].retryOnFail).toBe(true);
        expect(ast.nodes[0].maxTries).toBe(5);
        expect(ast.nodes[0].waitBetweenTries).toBe(2000);

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, { format: false, commentStyle: 'minimal' });

        // Verify the @node decorator contains the execution settings
        expect(tsCode).toContain('alwaysOutputData: true');
        expect(tsCode).toContain('executeOnce: false');
        expect(tsCode).toContain('retryOnFail: true');
        expect(tsCode).toContain('maxTries: 5');
        expect(tsCode).toContain('waitBetweenTries: 2000');
    });

    it('should preserve node execution settings through full pull→push roundtrip', async () => {
        const workflowJson = {
            id: 'wf-roundtrip-1',
            name: 'Roundtrip Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-rt-1',
                    name: 'My Node',
                    type: 'n8n-nodes-base.set',
                    typeVersion: 3,
                    position: [100, 200],
                    parameters: { mode: 'manual' },
                    alwaysOutputData: true,
                    retryOnFail: true,
                    maxTries: 3,
                    waitBetweenTries: 1000,
                },
            ],
            connections: {},
            settings: {},
        };

        // JSON → AST → TypeScript
        const jsonParser = new JsonToAstParser();
        const ast1 = jsonParser.parse(workflowJson as any);
        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast1, { format: false, commentStyle: 'minimal' });

        // TypeScript → AST → JSON
        const tsParser = new TypeScriptParser();
        const ast2 = await tsParser.parseCode(tsCode);

        // Verify execution settings are preserved in the re-parsed AST
        expect(ast2.nodes[0].alwaysOutputData).toBe(true);
        expect(ast2.nodes[0].retryOnFail).toBe(true);
        expect(ast2.nodes[0].maxTries).toBe(3);
        expect(ast2.nodes[0].waitBetweenTries).toBe(1000);
        // executeOnce was not set, so it should be undefined
        expect(ast2.nodes[0].executeOnce).toBeUndefined();

        const builder = new WorkflowBuilder();
        const rebuilt = builder.build(ast2);

        // Verify the rebuilt JSON preserves execution settings
        const rebuiltNode = rebuilt.nodes[0];
        expect(rebuiltNode.alwaysOutputData).toBe(true);
        expect(rebuiltNode.retryOnFail).toBe(true);
        expect(rebuiltNode.maxTries).toBe(3);
        expect(rebuiltNode.waitBetweenTries).toBe(1000);
        expect(rebuiltNode.executeOnce).toBeUndefined();
    });

    it('should emit [alwaysOutput] and [retry] flags in workflow-map for execution-setting nodes', async () => {
        const workflowJson = {
            id: 'wf-flags-1',
            name: 'Flags Workflow',
            active: false,
            nodes: [
                {
                    id: 'node-flags-1',
                    name: 'Always Output Node',
                    type: 'n8n-nodes-base.set',
                    typeVersion: 3,
                    position: [0, 0],
                    parameters: {},
                    alwaysOutputData: true,
                    retryOnFail: true,
                    maxTries: 2,
                },
                {
                    id: 'node-flags-2',
                    name: 'Once Node',
                    type: 'n8n-nodes-base.set',
                    typeVersion: 3,
                    position: [200, 0],
                    parameters: {},
                    executeOnce: true,
                },
            ],
            connections: {},
            settings: {},
        };

        const parser = new JsonToAstParser();
        const ast = parser.parse(workflowJson as any);
        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, { format: false });

        // The naming generator converts "Always Output Node" → "AlwaysOutputNode"
        // and "Once Node" → "OnceNode"
        expect(tsCode).toMatch(/AlwaysOutputNode\s+set\s+.*\[alwaysOutput\].*\[retry\]/);
        expect(tsCode).toMatch(/OnceNode\s+set\s+.*\[executeOnce\]/);
    });
});
