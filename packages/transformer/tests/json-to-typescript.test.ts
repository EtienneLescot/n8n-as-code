/**
 * Tests for JSON to TypeScript transformation
 */

import { describe, it, expect } from 'vitest';
import { JsonToAstParser } from '../src/parser/json-to-ast.js';
import { AstToTypeScriptGenerator } from '../src/parser/ast-to-typescript.js';
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
});
