import { TypeScriptParser, WorkflowBuilder } from './packages/transformer/src/index.js';

const workflowCode = `import { workflow, node, links } from '@n8n-as-code/transformer';

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'ymwIQV7MWynP9atu',
    name: 'Chat Conversationnel',
    active: false,
    settings: { executionOrder: 'v1', callerPolicy: 'workflowsFromSameOwner', availableInMCP: false },
})
export class ChatConversationnelWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        name: 'Chat Trigger',
        type: '@n8n/n8n-nodes-langchain.chatTrigger',
        version: 1.4,
        position: [250, 300],
    })
    ChatTrigger = {
        public: false,
        mode: 'hostedChat',
        authentication: 'none',
        initialMessages: 'Bonjour ! 👋\\nComment puis-je vous aider ?',
    };

    @node({
        name: 'Agent IA',
        type: '@n8n/n8n-nodes-langchain.agent',
        version: 3.1,
        position: [500, 300],
    })
    AgentIa = {
        promptType: 'auto',
        agent: 'conversationalAgent',
        text: '={{ $json.chatInput }}',
        binaryPropertyName: 'data',
        input: '={{ $json.chatInput }}',
    };

    @node({
        name: 'OpenAI Chat Model',
        type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
        version: 1.3,
        position: [400, 480],
    })
    OpenaiChatModel = {
        model: {
            mode: 'list',
            value: 'gpt-4o-mini',
        },
        responsesApiEnabled: false,
    };

    @node({
        name: 'Mémoire',
        type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
        version: 1.3,
        position: [600, 480],
    })
    Mmoire = {
        sessionIdType: 'fromInput',
        contextWindowLength: 10,
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ChatTrigger.out(0).to(this.AgentIa.in(0));
        this.AgentIa.uses({
            ai_languageModel: this.OpenaiChatModel.output,
            ai_memory: this.Mmoire.output,
        });
    }
}`;

async function test() {
    console.log('🧪 Testing .uses() parsing...\n');
    
    const parser = new TypeScriptParser();
    const ast = await parser.parseCode(workflowCode);
    
    console.log('📋 Extracted AST:');
    console.log('Nodes:', ast.nodes.length);
    for (const node of ast.nodes) {
        console.log(`  - ${node.displayName} (${node.propertyName})`);
        if (node.aiDependencies) {
            console.log('    AI Dependencies:', JSON.stringify(node.aiDependencies, null, 2));
        }
    }
    
    console.log('\n🔗 Connections:', ast.connections.length);
    for (const conn of ast.connections) {
        console.log(`  ${conn.from.node} → ${conn.to.node}`);
    }
    
    console.log('\n🏗️  Building JSON workflow...');
    const builder = new WorkflowBuilder();
    const workflow = builder.build(ast);
    
    console.log('\n📦 Generated connections:');
    console.log(JSON.stringify(workflow.connections, null, 2));
    
    // Check if AI connections are present
    const hasModelConnection = workflow.connections['OpenAI Chat Model']?.ai_languageModel;
    const hasMemoryConnection = workflow.connections['Mémoire']?.ai_memory;
    
    console.log('\n✅ Validation:');
    console.log(`  OpenAI Chat Model → Agent IA (ai_languageModel): ${hasModelConnection ? '✅' : '❌'}`);
    console.log(`  Mémoire → Agent IA (ai_memory): ${hasMemoryConnection ? '✅' : '❌'}`);
}

test().catch(console.error);
