/**
 * Quick test to verify watcher detects TypeScript workflow changes
 */

import fs from 'fs';
import path from 'path';

// Sample TypeScript workflow content
const sampleWorkflow = `import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
    id: 'G9GXzwX97XBKAwcj',
    name: 'Job Application Assistant 2',
    active: false,
    settings: { executionOrder: 'v1' },
})
export class JobApplicationAssistantWorkflow {
    @node({
        name: 'Manual Trigger',
        type: 'n8n-nodes-base.manualTrigger',
        version: 1,
        position: [0, 0],
    })
    ManualTrigger = {};
    
    @links()
    defineRouting() {
        // No connections
    }
}
`;

// Test ID extraction regex (same as watcher.ts)
const idMatch = sampleWorkflow.match(/@workflow\s*\(\s*{\s*id:\s*["']([^"']+)["']/);

console.log('\n🔍 Testing watcher ID extraction regex:\n');
console.log('Sample content:');
console.log(sampleWorkflow.substring(0, 200) + '...\n');

if (idMatch) {
    console.log('✅ Regex matched!');
    console.log('   Extracted ID:', idMatch[1]);
} else {
    console.log('❌ Regex FAILED to match');
    console.log('   This is the bug - watcher cannot extract ID from TypeScript files');
}

// Now test if changing the name affects the hash
console.log('\n📊 Testing if name changes affect hash:\n');

const modifiedWorkflow = sampleWorkflow.replace(
    "name: 'Job Application Assistant 2'",
    "name: 'Job Application Assistant 3'"
);

console.log('Original name line:', sampleWorkflow.match(/name: '[^']+'/)[0]);
console.log('Modified name line:', modifiedWorkflow.match(/name: '[^']+'/)[0]);
console.log('\n✅ If these are different, hash should change → sync should trigger');
