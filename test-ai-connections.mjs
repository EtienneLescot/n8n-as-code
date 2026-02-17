import { JsonToAstParser, AstToTypeScriptGenerator } from './packages/transformer/dist/index.js';
import { readFileSync } from 'fs';

const json = JSON.parse(readFileSync('./generated-workflows-examples/social-post-assistant.json', 'utf8'));
const parser = new JsonToAstParser();
const generator = new AstToTypeScriptGenerator();

const ast = parser.parse(json);

// Check how many nodes have AI dependencies
const nodesWithAI = ast.nodes.filter(n => n.aiDependencies && Object.keys(n.aiDependencies).length > 0);
console.log('\n✅ Nodes with AI dependencies extracted:', nodesWithAI.length);
nodesWithAI.slice(0, 3).forEach(n => {
    console.log(`   - ${n.propertyName}:`, Object.keys(n.aiDependencies));
});

const ts = await generator.generate(ast, { format: false, commentStyle: 'minimal' });

const usesMatches = ts.match(/\.uses\(/g) || [];
const outToMatches = ts.match(/\.out\(\d+\)\.to\(/g) || [];

console.log('\n✅ Uses calls generated:', usesMatches.length);
console.log('✅ Out-to calls generated:', outToMatches.length);

// Show sample .uses() calls
const usesLines = ts.split('\n').filter(l => l.includes('.uses('));
console.log('\n📝 Sample .uses() calls:');
usesLines.slice(0, 5).forEach(l => console.log('   ' + l.trim()));
