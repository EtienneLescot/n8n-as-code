/**
 * Demo: Convert social-post-assistant.json to TypeScript
 */

import { JsonToAstParser, AstToTypeScriptGenerator } from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log('🚀 Converting social-post-assistant.json to TypeScript...\n');
    
    // Load the complex workflow
    const workflowPath = path.resolve(__dirname, '../../../generated-workflows-examples/social-post-assistant.json');
    
    if (!fs.existsSync(workflowPath)) {
        console.error('❌ File not found:', workflowPath);
        process.exit(1);
    }
    
    const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
    
    console.log('📥 Input workflow:');
    console.log(`   Name: ${workflowJson.name}`);
    console.log(`   Nodes: ${workflowJson.nodes?.length || 0}`);
    console.log(`   Connections: ${Object.keys(workflowJson.connections || {}).length}`);
    console.log('');
    
    // Transform to TypeScript
    const parser = new JsonToAstParser();
    const ast = parser.parse(workflowJson);
    
    console.log('🔄 Parsed to AST:');
    console.log(`   Property names: ${ast.nodes.slice(0, 5).map(n => n.propertyName).join(', ')}...`);
    console.log('');
    
    const generator = new AstToTypeScriptGenerator();
    const tsCode = await generator.generate(ast, {
        format: true,
        commentStyle: 'verbose'
    });
    
    console.log('✅ Generated TypeScript:');
    console.log(`   Lines: ${tsCode.split('\n').length}`);
    console.log('');
    
    // Save output
    const outputPath = path.resolve(__dirname, '../../social-post-assistant.workflow.ts');
    fs.writeFileSync(outputPath, tsCode);
    
    console.log(`💾 Saved to: ${outputPath}`);
    console.log('');
    console.log('Preview (first 50 lines):');
    console.log('─'.repeat(80));
    console.log(tsCode.split('\n').slice(0, 50).join('\n'));
    console.log('─'.repeat(80));
    console.log(`... (${tsCode.split('\n').length - 50} more lines)`);
}

main().catch(console.error);
