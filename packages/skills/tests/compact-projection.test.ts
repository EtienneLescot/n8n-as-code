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
});
