/**
 * Tests for TypeScript to JSON transformation (roundtrip)
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

describe('TypeScript to JSON Transformation', () => {
    it('should parse TypeScript workflow to AST', async () => {
        // Load generated TypeScript file
        const tsFilePath = path.join(__dirname, 'output/simple-workflow.ts');
        
        if (!fs.existsSync(tsFilePath)) {
            // Generate it first
            const workflowJson = JSON.parse(
                fs.readFileSync(path.join(__dirname, 'fixtures/simple-workflow.json'), 'utf-8')
            );
            const parser = new JsonToAstParser();
            const ast = parser.parse(workflowJson);
            const generator = new AstToTypeScriptGenerator();
            const tsCode = await generator.generate(ast, { format: true });
            fs.mkdirSync(path.dirname(tsFilePath), { recursive: true });
            fs.writeFileSync(tsFilePath, tsCode);
        }
        
        const tsParser = new TypeScriptParser();
        const ast = await tsParser.parseFile(tsFilePath);
        
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
    });
    
    it('should build n8n JSON from AST', async () => {
        // Parse TypeScript to AST
        const tsFilePath = path.join(__dirname, 'output/simple-workflow.ts');
        const tsParser = new TypeScriptParser();
        const ast = await tsParser.parseFile(tsFilePath);
        
        // Build JSON
        const builder = new WorkflowBuilder();
        const workflow = builder.build(ast, { deterministicIds: true });
        
        // Verify structure
        expect(workflow.id).toBe('test-workflow-123');
        expect(workflow.name).toBe('Simple Test Workflow');
        expect(workflow.active).toBe(true);
        expect(workflow.nodes).toHaveLength(3);
        
        // Verify node IDs are preserved from the fixture
        expect(workflow.nodes[0].id).toBe('node-uuid-001');
        expect(workflow.nodes[1].id).toBe('node-uuid-002');
        expect(workflow.nodes[2].id).toBe('node-uuid-003');
        
        // Verify connections
        expect(workflow.connections).toBeDefined();
        expect(workflow.connections['Schedule Trigger']).toBeDefined();
        expect(workflow.connections['Schedule Trigger'].main).toBeDefined();
        expect(workflow.connections['Schedule Trigger'].main[0]).toHaveLength(1);
        expect(workflow.connections['Schedule Trigger'].main[0][0].node).toBe('HTTP Request');
    });
    
    it('should complete roundtrip: JSON → TS → JSON', async () => {
        // Load original JSON
        const originalJson = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'fixtures/simple-workflow.json'), 'utf-8')
        );
        
        // JSON → AST → TypeScript
        const jsonParser = new JsonToAstParser();
        const ast1 = jsonParser.parse(originalJson);
        const generator = new AstToTypeScriptGenerator();
        const tsCode = await generator.generate(ast1, { format: true });
        
        // TypeScript → AST → JSON
        const tsParser = new TypeScriptParser();
        const ast2 = await tsParser.parseCode(tsCode);
        const builder = new WorkflowBuilder();
        const resultJson = builder.build(ast2);
        
        // Compare essential fields
        expect(resultJson.id).toBe(originalJson.id);
        expect(resultJson.name).toBe(originalJson.name);
        expect(resultJson.active).toBe(originalJson.active);
        expect(resultJson.nodes).toHaveLength(originalJson.nodes.length);
        
        // Verify node IDs are preserved across the full roundtrip
        for (let i = 0; i < originalJson.nodes.length; i++) {
            const original = originalJson.nodes[i];
            const result = resultJson.nodes[i];
            
            expect(result.id).toBe(original.id);
            expect(result.name).toBe(original.name);
            expect(result.type).toBe(original.type);
            expect(result.typeVersion).toBe(original.typeVersion);
            expect(result.position).toEqual(original.position);
            expect(result.parameters).toEqual(original.parameters);
        }
        
        // Verify connections are preserved
        expect(Object.keys(resultJson.connections).length).toBe(Object.keys(originalJson.connections).length);
    });

    it('should preserve webhookId through TypeScript → JSON compilation', async () => {
        const tsCode = `
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'wf-webhook-ts', name: 'Webhook TS', active: false })
export class WebhookTsWorkflow {
    @node({
        id: 'node-webhook-ts',
        webhookId: 'wh_from_ts',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        version: 2,
        position: [0, 0],
    })
    Webhook = {
        path: 'incoming',
        httpMethod: 'POST',
    };

    @links()
    defineRouting() {}
}`;

        const parser = new TypeScriptParser();
        const ast = await parser.parseCode(tsCode);
        expect(ast.nodes[0].webhookId).toBe('wh_from_ts');

        const builder = new WorkflowBuilder();
        const workflow = builder.build(ast, { deterministicIds: true });

        expect(workflow.nodes[0].webhookId).toBe('wh_from_ts');
    });
});
