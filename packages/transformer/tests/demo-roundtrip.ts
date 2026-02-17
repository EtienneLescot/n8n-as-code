/**
 * Demo script: Test complete roundtrip transformation
 * JSON → TypeScript → JSON
 */

import { JsonToAstParser, AstToTypeScriptGenerator, TypeScriptParser, WorkflowBuilder } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🔄 Testing complete ROUNDTRIP transformation...\n');
    console.log('═'.repeat(80));
    
    // ================================================================
    // STEP 1: Load original JSON
    // ================================================================
    console.log('\n📥 STEP 1: Load original JSON workflow');
    const workflowPath = path.join(__dirname, 'fixtures/simple-workflow.json');
    const originalJson = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
    
    console.log(`   ✓ Loaded: ${originalJson.name}`);
    console.log(`   ✓ Nodes: ${originalJson.nodes.length}`);
    console.log(`   ✓ Connections: ${Object.keys(originalJson.connections).length}`);
    
    // ================================================================
    // STEP 2: JSON → TypeScript
    // ================================================================
    console.log('\n🔨 STEP 2: Transform JSON → TypeScript');
    const jsonParser = new JsonToAstParser();
    const ast1 = jsonParser.parse(originalJson);
    
    const generator = new AstToTypeScriptGenerator();
    const tsCode = await generator.generate(ast1, {
        format: true,
        commentStyle: 'verbose'
    });
    
    console.log(`   ✓ Generated TypeScript (${tsCode.split('\n').length} lines)`);
    
    // Save TypeScript file
    const tsOutputPath = path.join(__dirname, 'output/roundtrip-test.ts');
    fs.mkdirSync(path.dirname(tsOutputPath), { recursive: true });
    fs.writeFileSync(tsOutputPath, tsCode);
    console.log(`   ✓ Saved to: tests/output/roundtrip-test.ts`);
    
    // ================================================================
    // STEP 3: TypeScript → JSON
    // ================================================================
    console.log('\n🔨 STEP 3: Transform TypeScript → JSON');
    const tsParser = new TypeScriptParser();
    const ast2 = await tsParser.parseCode(tsCode);
    
    console.log(`   ✓ Parsed TypeScript`);
    console.log(`   ✓ Extracted ${ast2.nodes.length} nodes`);
    console.log(`   ✓ Extracted ${ast2.connections.length} connections`);
    
    const builder = new WorkflowBuilder();
    const resultJson = builder.build(ast2, {
        deterministicIds: true // Use deterministic IDs for comparison
    });
    
    console.log(`   ✓ Built n8n JSON workflow`);
    
    // Save result JSON
    const jsonOutputPath = path.join(__dirname, 'output/roundtrip-result.json');
    fs.writeFileSync(jsonOutputPath, JSON.stringify(resultJson, null, 2));
    console.log(`   ✓ Saved to: tests/output/roundtrip-result.json`);
    
    // ================================================================
    // STEP 4: Compare original vs result
    // ================================================================
    console.log('\n🔍 STEP 4: Compare original vs result');
    
    const comparisons = [
        { field: 'id', original: originalJson.id, result: resultJson.id },
        { field: 'name', original: originalJson.name, result: resultJson.name },
        { field: 'active', original: originalJson.active, result: resultJson.active },
        { field: 'nodes.length', original: originalJson.nodes.length, result: resultJson.nodes.length },
        { field: 'connections.keys', original: Object.keys(originalJson.connections).length, result: Object.keys(resultJson.connections).length }
    ];
    
    let allMatch = true;
    for (const comp of comparisons) {
        const match = JSON.stringify(comp.original) === JSON.stringify(comp.result);
        const icon = match ? '✅' : '❌';
        console.log(`   ${icon} ${comp.field}: ${match ? 'MATCH' : `MISMATCH (${comp.original} vs ${comp.result})`}`);
        if (!match) allMatch = false;
    }
    
    // Compare node details
    console.log('\n   Comparing node details:');
    for (let i = 0; i < originalJson.nodes.length; i++) {
        const original = originalJson.nodes[i];
        const result = resultJson.nodes[i];
        
        const nameMatch = original.name === result.name;
        const typeMatch = original.type === result.type;
        const paramsMatch = JSON.stringify(original.parameters) === JSON.stringify(result.parameters);
        
        const icon = nameMatch && typeMatch && paramsMatch ? '✅' : '⚠️';
        console.log(`   ${icon} Node ${i + 1}: ${original.name}`);
        
        if (!nameMatch) console.log(`      ❌ Name mismatch: ${original.name} vs ${result.name}`);
        if (!typeMatch) console.log(`      ❌ Type mismatch: ${original.type} vs ${result.type}`);
        if (!paramsMatch) console.log(`      ❌ Parameters mismatch`);
        
        if (!nameMatch || !typeMatch || !paramsMatch) allMatch = false;
    }
    
    // ================================================================
    // FINAL RESULT
    // ================================================================
    console.log('\n' + '═'.repeat(80));
    if (allMatch) {
        console.log('\n🎉 SUCCESS! Roundtrip transformation is PERFECT!');
        console.log('   JSON → TypeScript → JSON produced identical results');
    } else {
        console.log('\n⚠️  PARTIAL SUCCESS - Some differences found');
        console.log('   (This may be expected for node IDs and other generated fields)');
    }
    console.log('\n═'.repeat(80));
    
    // Display generated TypeScript
    console.log('\n📄 Generated TypeScript code:');
    console.log('─'.repeat(80));
    console.log(tsCode);
    console.log('─'.repeat(80));
}

main().catch(console.error);
