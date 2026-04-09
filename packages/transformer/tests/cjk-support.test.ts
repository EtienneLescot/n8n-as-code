/**
 * Tests for CJK (Chinese/Japanese/Korean) identifier support
 *
 * Validates that non-ASCII node names are preserved through:
 * - Property name generation (naming.ts)
 * - JSON → TypeScript generation
 * - TypeScript → JSON roundtrip (parser + builder)
 */

import { describe, it, expect } from 'vitest';
import { generatePropertyName, generateClassName, createPropertyNameContext } from '../src/utils/naming.js';
import { JsonToAstParser } from '../src/parser/json-to-ast.js';
import { AstToTypeScriptGenerator } from '../src/parser/ast-to-typescript.js';
import { TypeScriptParser } from '../src/compiler/typescript-parser.js';
import { WorkflowBuilder } from '../src/compiler/workflow-builder.js';

describe('CJK Identifier Support', () => {
    describe('generatePropertyName – CJK characters', () => {
        it('should preserve Chinese characters in property names', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('檢查是否到齊', context)).toBe('檢查是否到齊');
        });

        it('should preserve mixed Chinese and ASCII names', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('下載 LINE 檔案', context)).toBe('下載Line檔案');
        });

        it('should handle Chinese name collisions with numeric suffix', () => {
            const context = createPropertyNameContext();
            const first = generatePropertyName('設定變數', context);
            const second = generatePropertyName('設定變數', context);
            expect(first).toBe('設定變數');
            expect(second).toBe('設定變數1');
        });

        it('should strip emojis but keep Chinese characters', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('🔍 搜尋資料', context)).toBe('搜尋資料');
        });

        it('should preserve Japanese Hiragana and Katakana', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('データ取得', context)).toBe('データ取得');
        });

        it('should preserve Korean Hangul', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('데이터 가져오기', context)).toBe('데이터가져오기');
        });
    });

    describe('generateClassName – CJK characters', () => {
        it('should preserve Chinese in class names', () => {
            const result = generateClassName('謄本自動化');
            expect(result).toBe('謄本自動化Workflow');
        });
    });

    describe('Roundtrip – CJK workflow', () => {
        const cjkWorkflowJson = {
            id: 'cjk-test-workflow',
            name: '謄本自動化測試',
            active: false,
            nodes: [
                {
                    id: 'node-trigger',
                    name: 'LINE Webhook',
                    type: 'n8n-nodes-base.webhook',
                    typeVersion: 2,
                    position: [0, 0] as [number, number],
                    parameters: { httpMethod: 'POST', path: 'test' },
                },
                {
                    id: 'node-check',
                    name: '檢查是否到齊',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [200, 0] as [number, number],
                    parameters: { jsCode: 'return [{ json: { ok: true } }];' },
                },
                {
                    id: 'node-if',
                    name: '圖片到齊？',
                    type: 'n8n-nodes-base.if',
                    typeVersion: 2,
                    position: [400, 0] as [number, number],
                    parameters: {
                        conditions: {
                            conditions: [{
                                leftValue: '={{ $json.ok }}',
                                rightValue: true,
                                operator: { type: 'boolean', operation: 'equals' },
                            }],
                            combinator: 'and',
                        },
                    },
                },
                {
                    id: 'node-download',
                    name: '準備下載清單',
                    type: 'n8n-nodes-base.code',
                    typeVersion: 2,
                    position: [600, 0] as [number, number],
                    parameters: { jsCode: 'return $input.all();' },
                },
            ],
            connections: {
                'LINE Webhook': {
                    main: [[{ node: '檢查是否到齊', type: 'main', index: 0 }]],
                },
                '檢查是否到齊': {
                    main: [[{ node: '圖片到齊？', type: 'main', index: 0 }]],
                },
                '圖片到齊？': {
                    main: [
                        [{ node: '準備下載清單', type: 'main', index: 0 }],
                        [],
                    ],
                },
            },
            settings: {},
            tags: [],
        };

        it('should generate TypeScript with Chinese property names', async () => {
            const parser = new JsonToAstParser();
            const ast = parser.parse(cjkWorkflowJson as any);
            const generator = new AstToTypeScriptGenerator();
            const tsCode = await generator.generate(ast, { format: false });

            // Property names should be Chinese, not "Node", "Node1", etc.
            expect(tsCode).toContain('檢查是否到齊');
            expect(tsCode).toContain('圖片到齊');
            expect(tsCode).toContain('準備下載清單');
            expect(tsCode).not.toMatch(/\bNode\b\s*=/);
        });

        it('should parse Chinese routing back to AST connections', async () => {
            const parser = new JsonToAstParser();
            const ast = parser.parse(cjkWorkflowJson as any);
            const generator = new AstToTypeScriptGenerator();
            const tsCode = await generator.generate(ast, { format: false });

            const tsParser = new TypeScriptParser();
            const roundtripAst = await tsParser.parseCode(tsCode);

            // Should have 3 connections (Webhook→檢查, 檢查→圖片, 圖片→準備)
            expect(roundtripAst.connections.length).toBe(3);

            const connStrings = roundtripAst.connections.map(
                c => `${c.from.node}→${c.to.node}`
            );
            expect(connStrings).toContain('LineWebhook→檢查是否到齊');
            expect(connStrings).toContain('檢查是否到齊→圖片到齊');
            expect(connStrings).toContain('圖片到齊→準備下載清單');
        });

        it('should complete full roundtrip: JSON → TS → JSON with zero loss', async () => {
            // JSON → TS
            const jsonParser = new JsonToAstParser();
            const ast1 = jsonParser.parse(cjkWorkflowJson as any);
            const generator = new AstToTypeScriptGenerator();
            const tsCode = await generator.generate(ast1, { format: true });

            // TS → JSON
            const tsParser = new TypeScriptParser();
            const ast2 = await tsParser.parseCode(tsCode);
            const builder = new WorkflowBuilder();
            const resultJson = builder.build(ast2);

            // Nodes
            expect(resultJson.nodes).toHaveLength(cjkWorkflowJson.nodes.length);
            for (const origNode of cjkWorkflowJson.nodes) {
                const found = resultJson.nodes.find((n: any) => n.name === origNode.name);
                expect(found, `Node "${origNode.name}" should exist`).toBeDefined();
                expect(found!.name).toBe(origNode.name);
                expect(found!.type).toBe(origNode.type);
                expect(found!.parameters).toEqual(origNode.parameters);
            }

            // Connections – same number of source nodes
            expect(Object.keys(resultJson.connections).length)
                .toBe(Object.keys(cjkWorkflowJson.connections).length);

            // Connections – same targets
            for (const [src, data] of Object.entries(cjkWorkflowJson.connections)) {
                expect(resultJson.connections[src], `Connection source "${src}" should exist`).toBeDefined();
                const origTargets = (data as any).main.flat().map((t: any) => t.node);
                const resultTargets = resultJson.connections[src].main.flat().map((t: any) => t.node);
                expect(resultTargets).toEqual(origTargets);
            }
        });
    });
});
