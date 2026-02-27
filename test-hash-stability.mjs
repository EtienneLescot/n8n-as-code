
import { WorkflowTransformerAdapter } from './packages/cli/dist/core/services/workflow-transformer-adapter.js';

const mockWorkflow = {
    name: 'Test Workflow',
    nodes: [
        {
            name: 'Start',
            type: 'n8n-nodes-base.start',
            typeVersion: 1,
            position: [250, 300],
            parameters: {}
        },
        {
            name: 'NoOp',
            type: 'n8n-nodes-base.noOp',
            typeVersion: 1,
            position: [450, 300],
            parameters: {
                someValue: '{{ $json.foo }}'
            }
        }
    ],
    connections: {
        Start: {
            main: [
                [
                    {
                        node: 'NoOp',
                        type: 'main',
                        index: 0
                    }
                ]
            ]
        }
    },
    settings: {
        executionOrder: 'v1'
    }
};

async function testHashStability() {
    console.log('--- Testing Hash Stability ---');
    
    // 1. Hash from JSON (uses format: false, minimal)
    const hash1 = await WorkflowTransformerAdapter.hashWorkflowFromJson(mockWorkflow as any);
    console.log('Hash from JSON (minimal):', hash1);
    
    // 2. Convert to TypeScript (formatted, verbose)
    const tsCode = await WorkflowTransformerAdapter.convertToTypeScript(mockWorkflow as any, {
        format: true,
        commentStyle: 'verbose'
    });
    
    // 3. Hash from TS (uses compileToJson)
    const hash2 = await WorkflowTransformerAdapter.hashWorkflow(tsCode);
    console.log('Hash from TS (formatted/verbose):', hash2);
    
    if (hash1 === hash2) {
        console.log('✅ Hashes are stable!');
    } else {
        console.log('❌ HASH MISMATCH!');
        
        // Let's investigate why
        const wf1 = await WorkflowTransformerAdapter.compileToJson(
            await WorkflowTransformerAdapter.convertToTypeScript(mockWorkflow as any, { format: false, commentStyle: 'minimal' })
        );
        const wf2 = await WorkflowTransformerAdapter.compileToJson(tsCode);
        
        const norm1 = (WorkflowTransformerAdapter as any).normalizeForHash(wf1);
        const norm2 = (WorkflowTransformerAdapter as any).normalizeForHash(wf2);
        
        console.log('Normalized 1 (minimal TS):', JSON.stringify(norm1, null, 2));
        console.log('Normalized 2 (formatted TS):', JSON.stringify(norm2, null, 2));
    }
}

testHashStability().catch(console.error);
