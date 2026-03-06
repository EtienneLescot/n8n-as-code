/**
 * Tests for JSON to TypeScript transformation
 */

import { describe, it, expect } from 'vitest';
import { JsonToAstParser } from '../src/parser/json-to-ast.js';
import { AstToTypeScriptGenerator } from '../src/parser/ast-to-typescript.js';
import { TypeScriptParser } from '../src/compiler/typescript-parser.js';
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
        const ast = parser.parse(workflowJson as any);
        expect(ast.nodes[0].webhookId).toBe('wh_123456');

        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast, {
            format: false,
            commentStyle: 'minimal'
        });

        expect(tsCode).toContain('webhookId: "wh_123456"');
    });
});
