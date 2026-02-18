/**
 * Tests for AI connection types (.uses() syntax)
 *
 * Covers:
 * - Parsing .uses() calls from TypeScript code
 * - Generating correct n8n JSON connections for all 12 AI types
 * - Optional connections (only declared ones appear in output)
 * - Array types (ai_tool, ai_document)
 */

import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../src/compiler/typescript-parser.js';
import { WorkflowBuilder } from '../src/compiler/workflow-builder.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkflow(routingBody: string, extraNodes: string = '') {
    return `
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ id: 'test', name: 'Test', active: false })
export class TestWorkflow {
    @node({ name: 'Agent', type: '@n8n/n8n-nodes-langchain.agent', version: 1, position: [0, 0] })
    Agent = {};

    @node({ name: 'Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', version: 1, position: [100, 0] })
    Model = {};

    @node({ name: 'Memory', type: '@n8n/n8n-nodes-langchain.memoryBuffer', version: 1, position: [200, 0] })
    Memory = {};

    @node({ name: 'Parser', type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1, position: [300, 0] })
    Parser = {};

    @node({ name: 'Tool1', type: '@n8n/n8n-nodes-langchain.toolCode', version: 1, position: [400, 0] })
    Tool1 = {};

    @node({ name: 'Tool2', type: '@n8n/n8n-nodes-langchain.toolHttpRequest', version: 1, position: [500, 0] })
    Tool2 = {};

    @node({ name: 'Splitter', type: '@n8n/n8n-nodes-langchain.textSplitterRecursive', version: 1, position: [600, 0] })
    Splitter = {};

    @node({ name: 'Doc1', type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader', version: 1, position: [700, 0] })
    Doc1 = {};

    @node({ name: 'Embedding', type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi', version: 1, position: [100, 200] })
    Embedding = {};

    @node({ name: 'VectorStore', type: '@n8n/n8n-nodes-langchain.vectorStoreInMemory', version: 1, position: [200, 200] })
    VectorStore = {};

    @node({ name: 'Retriever', type: '@n8n/n8n-nodes-langchain.retrieverVectorStore', version: 1, position: [300, 200] })
    Retriever = {};

    @node({ name: 'Reranker', type: '@n8n/n8n-nodes-langchain.rerankerCohere', version: 1, position: [400, 200] })
    Reranker = {};

    ${extraNodes}

    @links()
    defineRouting() {
        ${routingBody}
    }
}`;
}

async function parse(code: string) {
    const parser = new TypeScriptParser();
    return parser.parseCode(code);
}

async function build(code: string) {
    const ast = await parse(code);
    const builder = new WorkflowBuilder();
    return { ast, workflow: builder.build(ast) };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('AI connections — .uses() parsing', () => {
    it('extracts a single ai_languageModel dependency', async () => {
        const ast = await parse(makeWorkflow(
            `this.Agent.uses({ ai_languageModel: this.Model.output });`
        ));
        const agent = ast.nodes.find(n => n.propertyName === 'Agent')!;
        expect(agent.aiDependencies?.ai_languageModel).toBe('Model');
    });

    it('extracts multiple single-value dependencies', async () => {
        const ast = await parse(makeWorkflow(`
            this.Agent.uses({
                ai_languageModel: this.Model.output,
                ai_memory: this.Memory.output,
                ai_outputParser: this.Parser.output,
                ai_textSplitter: this.Splitter.output,
            });
        `));
        const deps = ast.nodes.find(n => n.propertyName === 'Agent')!.aiDependencies!;
        expect(deps.ai_languageModel).toBe('Model');
        expect(deps.ai_memory).toBe('Memory');
        expect(deps.ai_outputParser).toBe('Parser');
        expect(deps.ai_textSplitter).toBe('Splitter');
    });

    it('extracts ai_tool as an array', async () => {
        const ast = await parse(makeWorkflow(
            `this.Agent.uses({ ai_tool: [this.Tool1.output, this.Tool2.output] });`
        ));
        const deps = ast.nodes.find(n => n.propertyName === 'Agent')!.aiDependencies!;
        expect(deps.ai_tool).toEqual(['Tool1', 'Tool2']);
    });

    it('extracts ai_document as an array', async () => {
        const ast = await parse(makeWorkflow(
            `this.Agent.uses({ ai_document: [this.Doc1.output] });`
        ));
        const deps = ast.nodes.find(n => n.propertyName === 'Agent')!.aiDependencies!;
        expect(deps.ai_document).toEqual(['Doc1']);
    });

    it('extracts RAG connection types (embedding, vectorStore, retriever, reranker)', async () => {
        const ast = await parse(makeWorkflow(`
            this.Agent.uses({
                ai_embedding: this.Embedding.output,
                ai_vectorStore: this.VectorStore.output,
                ai_retriever: this.Retriever.output,
                ai_reranker: this.Reranker.output,
            });
        `));
        const deps = ast.nodes.find(n => n.propertyName === 'Agent')!.aiDependencies!;
        expect(deps.ai_embedding).toBe('Embedding');
        expect(deps.ai_vectorStore).toBe('VectorStore');
        expect(deps.ai_retriever).toBe('Retriever');
        expect(deps.ai_reranker).toBe('Reranker');
    });
});

describe('AI connections — JSON generation', () => {
    it('generates ai_languageModel connection in n8n JSON format', async () => {
        const { workflow } = await build(makeWorkflow(
            `this.Agent.uses({ ai_languageModel: this.Model.output });`
        ));
        expect(workflow.connections['Model']).toHaveProperty('ai_languageModel');
        const conn = workflow.connections['Model']['ai_languageModel'][0][0];
        expect(conn.node).toBe('Agent');
        expect(conn.type).toBe('ai_languageModel');
        expect(conn.index).toBe(0);
    });

    it('generates one connection per ai_tool array entry', async () => {
        const { workflow } = await build(makeWorkflow(
            `this.Agent.uses({ ai_tool: [this.Tool1.output, this.Tool2.output] });`
        ));
        expect(workflow.connections['Tool1']['ai_tool'][0][0].node).toBe('Agent');
        expect(workflow.connections['Tool2']['ai_tool'][0][0].node).toBe('Agent');
    });

    it('only generates connections that are present in .uses()', async () => {
        const { workflow } = await build(makeWorkflow(`
            this.Agent.uses({
                ai_languageModel: this.Model.output,
                ai_memory: this.Memory.output,
            });
        `));
        const connTypes = new Set(
            Object.values(workflow.connections).flatMap(o => Object.keys(o))
        );
        expect(connTypes.has('ai_languageModel')).toBe(true);
        expect(connTypes.has('ai_memory')).toBe(true);
        // Optional types NOT declared must be absent
        expect(connTypes.has('ai_outputParser')).toBe(false);
        expect(connTypes.has('ai_tool')).toBe(false);
    });

    it('generates all 12 AI connection types when all are declared', async () => {
        const { workflow } = await build(makeWorkflow(`
            this.Agent.uses({
                ai_languageModel: this.Model.output,
                ai_memory: this.Memory.output,
                ai_outputParser: this.Parser.output,
                ai_textSplitter: this.Splitter.output,
                ai_embedding: this.Embedding.output,
                ai_vectorStore: this.VectorStore.output,
                ai_retriever: this.Retriever.output,
                ai_reranker: this.Reranker.output,
                ai_tool: [this.Tool1.output, this.Tool2.output],
                ai_document: [this.Doc1.output],
            });
        `));

        const connTypes = new Set(
            Object.values(workflow.connections).flatMap(o => Object.keys(o))
        );

        const expected = [
            'ai_languageModel', 'ai_memory', 'ai_outputParser', 'ai_textSplitter',
            'ai_embedding', 'ai_vectorStore', 'ai_retriever', 'ai_reranker',
            'ai_tool', 'ai_document',
        ];
        for (const t of expected) {
            expect(connTypes.has(t), `Missing connection type: ${t}`).toBe(true);
        }
    });
});
