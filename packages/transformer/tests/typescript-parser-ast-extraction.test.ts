/**
 * Tests for TypeScriptParser's AST-based value extraction.
 *
 * Covers the bug reported in:
 *   "Failed to parse object literal: ReferenceError: foo is not defined"
 *
 * The parser must correctly handle:
 *  - All literal value types (strings, numbers, booleans, null, arrays, objects)
 *  - Helpful errors for dynamic / unsupported expressions (function calls,
 *    identifiers, etc.) with no misleading workaround suggestions
 */

import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../src/compiler/typescript-parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal workflow scaffold that wraps the given node body. */
function makeWorkflow(nodeBody: string, preamble = ''): string {
    return `
import { workflow, node, links } from '@n8n-as-code/core';
${preamble}

@workflow({ name: 'Test', active: false })
export class TestWorkflow {
    @node({
        name: 'Test Node',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [0, 0],
    })
    TestNode = ${nodeBody};

    @links()
    defineRouting() {}
}
`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TypeScriptParser – AST value extraction', () => {

    describe('literal values', () => {
        it('parses string literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ jsCode: "console.log('hi')" }`));
            expect(ast.nodes[0].parameters.jsCode).toBe("console.log('hi')");
        });

        it('parses number literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ retryOnFail: 3 }`));
            expect(ast.nodes[0].parameters.retryOnFail).toBe(3);
        });

        it('parses negative number literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ offset: -10 }`));
            expect(ast.nodes[0].parameters.offset).toBe(-10);
        });

        it('parses boolean literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ continueOnFail: true }`));
            expect(ast.nodes[0].parameters.continueOnFail).toBe(true);
        });

        it('parses null', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ value: null }`));
            expect(ast.nodes[0].parameters.value).toBeNull();
        });

        it('parses array literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ values: [1, 2, 3] }`));
            expect(ast.nodes[0].parameters.values).toEqual([1, 2, 3]);
        });

        it('folds concatenated string literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(
                `{ text: 'You are a triage agent. ' + 'Sort the inbox by urgency.' }`,
            ));
            expect(ast.nodes[0].parameters.text)
                .toBe('You are a triage agent. Sort the inbox by urgency.');
        });

        it('folds a chain of concatenated literals across lines', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(
                `{ text: 'line one ' +
'line two ' +
'line three' }`,
            ));
            expect(ast.nodes[0].parameters.text).toBe('line one line two line three');
        });

        it('folds mixed string and number concatenation like JavaScript does', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ text: 'v' + 2 }`));
            expect(ast.nodes[0].parameters.text).toBe('v2');
        });

        it('adds numeric literals rather than concatenating them', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ limit: 20 + 5 }`));
            expect(ast.nodes[0].parameters.limit).toBe(25);
        });

        it('unwraps parenthesized concatenation', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ text: ('a' + 'b') }`));
            expect(ast.nodes[0].parameters.text).toBe('ab');
        });

        it('still rejects concatenation with a non-literal operand', async () => {
            const parser = new TypeScriptParser();
            await expect(parser.parseCode(makeWorkflow(`{ text: 'prefix' + someVar }`)))
                .rejects.toThrow(/someVar/);
        });

        it('parses nested object literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow(`{ options: { timeout: 5000, retries: 3 } }`));
            expect(ast.nodes[0].parameters.options).toEqual({ timeout: 5000, retries: 3 });
        });

        it('parses no-substitution template literals', async () => {
            const parser = new TypeScriptParser();
            const ast = await parser.parseCode(makeWorkflow('{ jsCode: `const x = 1;` }'));
            expect(ast.nodes[0].parameters.jsCode).toBe('const x = 1;');
        });
    });

    describe('dynamic / unsupported expressions', () => {
        it('throws a helpful error for a bare function call  (original bug report)', async () => {
            const parser = new TypeScriptParser();
            const code = makeWorkflow(
                `{ jsCode: foo() }`,
                `function foo() { return "code"; }`
            );
            await expect(parser.parseCode(code)).rejects.toThrow(
                /Dynamic expression not supported/
            );
        });

        it('throws a helpful error for require().readFileSync call', async () => {
            const parser = new TypeScriptParser();
            const code = makeWorkflow(
                `{ jsCode: require('fs').readFileSync("code/example.js") }`
            );
            await expect(parser.parseCode(code)).rejects.toThrow(
                /Dynamic expression not supported/
            );
        });

        it('error message does not suggest misleading workarounds', async () => {
            const parser = new TypeScriptParser();
            const code = makeWorkflow(`{ jsCode: foo() }`, `function foo() { return "x"; }`);
            await expect(parser.parseCode(code)).rejects.toThrow(/inline literal values/);
        });

        it('throws a helpful error for a bare identifier (not undefined)', async () => {
            const parser = new TypeScriptParser();
            const code = makeWorkflow(`{ jsCode: unknownVar }`);
            await expect(parser.parseCode(code)).rejects.toThrow(
                /Cannot use identifier "unknownVar"/
            );
        });
    });
});
