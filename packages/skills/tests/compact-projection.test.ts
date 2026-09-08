import { TypeScriptFormatter } from '../src/services/typescript-formatter';

const bigSchema = {
    name: 'gmailTool',
    type: 'gmailTool',
    displayName: 'Gmail Tool',
    description: 'Consume the Gmail API with many features including creating, updating, deleting, and getting messages, drafts, labels, and threads across mailboxes.',
    version: 1,
    properties: Array.from({ length: 30 }, (_, i) => ({
        name: `param${i}`,
        type: 'options',
        description: `param ${i}`,
        required: i < 3,
        options: Array.from({ length: 25 }, (_, j) => ({ value: `opt${j}`, name: `Opt ${j}` })),
    })),
    parameterGating: [{ flag: 'needsConnection', gatedParams: ['a', 'b'], aiConnectionType: null }],
};

describe('compact projection (universal, no per-node heuristics)', () => {
    test('compact doc is bounded while full doc grows with prop/enum count', () => {
        const compact = TypeScriptFormatter.generateCompactNodeDoc(bigSchema as any);
        const full = TypeScriptFormatter.generateCompleteNodeDoc(bigSchema as any);
        expect(compact.length).toBeLessThan(full.length / 3);
        expect(compact).toMatch('Gmail Tool');
        expect(compact).toMatch('param0');
        expect(compact).toMatch('needsConnection');
        // enum truncation marker, same rule for every node
        expect(compact).toMatch('+15 more');
    });

    test('minimal snippet stays constant size regardless of schema size', () => {
        const snippet = TypeScriptFormatter.generateMinimalSnippet(bigSchema);
        expect(snippet.length).toBeLessThan(500);
        expect(snippet).toMatch(`type: 'gmailTool'`);
    });

    test('required list is capped with a truncation marker', () => {
        const manyRequired = {
            ...bigSchema,
            properties: Array.from({ length: 40 }, (_, i) => ({
                name: `req${i}`,
                type: 'string',
                required: true,
            })),
        };
        const compact = TypeScriptFormatter.generateCompactNodeDoc(manyRequired as any);
        expect(compact).toMatch('req14');
        expect(compact).not.toMatch('req15');
        expect(compact).toMatch('+25 more required');
    });

    test('gating flag list is capped with a truncation marker', () => {
        const manyGating = {
            ...bigSchema,
            properties: [],
            parameterGating: Array.from({ length: 14 }, (_, i) => ({
                flag: `flag${i}`,
                gatedParams: [],
                aiConnectionType: null,
            })),
        };
        const compact = TypeScriptFormatter.generateCompactNodeDoc(manyGating as any);
        expect(compact).toMatch('flag9');
        expect(compact).not.toMatch('flag10');
        expect(compact).toMatch('+4 more flags');
    });

    test('custom caps override the defaults', () => {
        const manyRequired = {
            ...bigSchema,
            properties: Array.from({ length: 10 }, (_, i) => ({
                name: `req${i}`,
                type: 'string',
                required: true,
            })),
        };
        const compact = TypeScriptFormatter.generateCompactNodeDoc(manyRequired as any, { maxRequired: 3 });
        expect(compact).toMatch('req2');
        expect(compact).not.toMatch('req3');
        expect(compact).toMatch('+7 more required');
    });
});
