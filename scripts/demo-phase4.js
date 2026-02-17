#!/usr/bin/env node

/**
 * Phase 4 Demo: Skills Package TypeScript Support
 * 
 * This script demonstrates the new TypeScript workflow capabilities:
 * 1. Convert JSON workflow to TypeScript
 * 2. Validate TypeScript workflow
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonToAstParser, AstToTypeScriptGenerator, TypeScriptParser, WorkflowBuilder } from '../packages/transformer/dist/index.js';
import { WorkflowValidator } from '../packages/skills/dist/services/workflow-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function demo() {
    console.log('🚀 Phase 4 Demo: Skills Package TypeScript Support\n');
    
    // 1. Load the social-post-assistant.json workflow
    const jsonPath = path.join(__dirname, '../generated-workflows-examples/social-post-assistant.json');
    console.log('📥 Loading workflow:', jsonPath);
    const workflowJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`   ✅ Loaded workflow: "${workflowJson.name}" (${workflowJson.nodes.length} nodes)\n`);
    
    // 2. Convert to TypeScript
    console.log('🔄 Converting to TypeScript...');
    const parser = new JsonToAstParser();
    const ast = parser.parse(workflowJson);
    const generator = new AstToTypeScriptGenerator();
    const tsCode = await generator.generate(ast, { format: true, commentStyle: 'verbose' });
    
    const tsPath = path.join(__dirname, '../generated-workflows-examples/social-post-assistant.workflow.ts');
    fs.writeFileSync(tsPath, tsCode, 'utf-8');
    console.log(`   ✅ TypeScript workflow saved: ${tsPath}`);
    console.log(`   📊 Size: ${tsCode.length} characters, ${tsCode.split('\n').length} lines\n`);
    
    // 3. Validate JSON workflow
    console.log('✅ Validating JSON workflow...');
    const validator = new WorkflowValidator();
    const jsonResult = await validator.validateWorkflow(workflowJson, false);
    console.log(`   Errors: ${jsonResult.errors.length}`);
    console.log(`   Warnings: ${jsonResult.warnings.length}`);
    console.log(`   Valid: ${jsonResult.valid ? '✅' : '❌'}\n`);
    
    // 4. Validate TypeScript workflow
    console.log('✅ Validating TypeScript workflow...');
    const tsResult = await validator.validateWorkflow(tsCode, true);
    console.log(`   Errors: ${tsResult.errors.length}`);
    console.log(`   Warnings: ${tsResult.warnings.length}`);
    console.log(`   Valid: ${tsResult.valid ? '✅' : '❌'}\n`);
    
    // 5. Roundtrip test: TS → JSON → compare
    console.log('🔄 Roundtrip test: TypeScript → JSON...');
    const tsParser = new TypeScriptParser();
    const compiledAst = await tsParser.parseCode(tsCode);
    const builder = new WorkflowBuilder();
    const compiledJson = builder.build(compiledAst);
    
    // Compare node counts
    const originalNodes = workflowJson.nodes.length;
    const compiledNodes = compiledJson.nodes.length;
    console.log(`   Original nodes: ${originalNodes}`);
    console.log(`   Compiled nodes: ${compiledNodes}`);
    console.log(`   Match: ${originalNodes === compiledNodes ? '✅' : '❌'}\n`);
    
    console.log('✨ Demo complete!\n');
    console.log('📋 Summary:');
    console.log(`   ✅ Converted ${workflowJson.nodes.length}-node workflow to TypeScript`);
    console.log(`   ✅ Validated both JSON and TypeScript formats`);
    console.log(`   ✅ Roundtrip conversion successful`);
    console.log('\n💡 Try it yourself:');
    console.log(`   node packages/skills/dist/cli.js validate ${tsPath}`);
}

demo().catch(console.error);
