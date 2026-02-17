/**
 * Demo script: Test JSON to TypeScript transformation
 */

import { JsonToAstParser, AstToTypeScriptGenerator } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🚀 Testing JSON → TypeScript transformation...\n');
    
    // Load simple workflow JSON
    const workflowPath = path.join(__dirname, 'fixtures/simple-workflow.json');
    const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
    
    console.log('📥 Input: simple-workflow.json');
    console.log(`   - Workflow: ${workflowJson.name}`);
    console.log(`   - Nodes: ${workflowJson.nodes.length}`);
    console.log(`   - Connections: ${Object.keys(workflowJson.connections).length}\n`);
    
    // Parse to AST
    const parser = new JsonToAstParser();
    const ast = parser.parse(workflowJson);
    
    console.log('🔄 Parsed to AST:');
    console.log(`   - Property names: ${ast.nodes.map(n => n.propertyName).join(', ')}`);
    console.log(`   - Connections: ${ast.connections.length}\n`);
    
    // Generate TypeScript
    const generator = new AstToTypeScriptGenerator();
    const tsCode = await generator.generate(ast, {
        format: true,
        commentStyle: 'verbose'
    });
    
    console.log('✅ Generated TypeScript:\n');
    console.log('─'.repeat(80));
    console.log(tsCode);
    console.log('─'.repeat(80));
    
    // Write output file
    const outputPath = path.join(__dirname, 'output/simple-workflow.ts');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, tsCode);
    
    console.log(`\n💾 Saved to: tests/output/simple-workflow.ts`);
    console.log('\n✨ Transformation complete!');
}

main().catch(console.error);
