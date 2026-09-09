import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TypeScriptFormatter } from '../src/services/typescript-formatter';
import { WorkflowValidator } from '../src/services/workflow-validator.js';

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

/**
 * The compact projection is the cheapest thing an agent can read about a node, so anything
 * it prints is taken as authorable. It has twice shipped pairs n8n rejects: first by
 * reading one `displayOptions` variant's enum as the whole set, then by grouping operations
 * on `resource` alone while the validator also weighs `@version`, `source` and
 * `authentication`. Both were found by a builder mid-benchmark rather than by a test.
 *
 * So this checks the property directly, against the real bundled ontology and the real
 * validator: every (resource, operation) pair compact prints must survive validation.
 */
const ontologyPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/assets/n8n-nodes-technical.json',
);
const describeWithOntology = fs.existsSync(ontologyPath) ? describe : describe.skip;

describeWithOntology('compact never advertises a pair the validator rejects', () => {
    // `//   <resource>[ (<gate>=<value>, ...)]: op | op | ...`
    const groupLine = /^\/\/   ([^:(]+?)(?: \(([^)]*)\))?: (.+)$/;

    test('every printed (resource, operation) pair validates', async () => {
        const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
        const validator = new WorkflowValidator(ontologyPath);
        const rejected: string[] = [];
        let checked = 0;

        for (const node of Object.values<any>(ontology.nodes)) {
            if (!node.type) continue;
            const doc = TypeScriptFormatter.generateCompactNodeDoc({
                name: node.name,
                type: node.type,
                displayName: node.displayName,
                description: node.description,
                version: node.version,
                properties: node.schema?.properties ?? [],
                parameterGating: node.metadata?.parameterGating,
            });

            const lines = doc.split('\n');
            const start = lines.indexOf('// operation, by resource:');
            if (start === -1) continue;
            const version = Array.isArray(node.version) ? Math.max(...node.version) : node.version;

            for (let i = start + 1; i < lines.length; i++) {
                const match = groupLine.exec(lines[i]);
                if (!match) break;
                const [, resource, gates, operations] = match;
                // Truncation markers are not values.
                const values = operations.split(' | ')
                    .filter((value) => !value.startsWith('...') && !value.startsWith('+'));
                const gateParams = Object.fromEntries(
                    (gates ? gates.split(', ') : []).map((gate) => {
                        const [key, value] = gate.split('=');
                        return [key, value.split('|')[0]];
                    }),
                );

                for (const operation of values) {
                    checked++;
                    const result = await validator.validateWorkflow({
                        nodes: [{
                            id: '1',
                            name: 'N',
                            type: node.type,
                            typeVersion: version,
                            position: [0, 0],
                            // `*` means the operation is not gated on a resource at all.
                            parameters: {
                                ...(resource === '*' ? {} : { resource }),
                                operation,
                                ...gateParams,
                            },
                        }],
                        connections: {},
                    });
                    const fatal = result.errors.filter(
                        (e: any) => e.path?.endsWith('.operation') || e.path?.endsWith('.resource'),
                    );
                    if (fatal.length > 0) {
                        rejected.push(`${node.name} v${version} ${lines[i].trim()} -> ${operation}: ${fatal[0].message}`);
                    }
                }
            }
        }

        expect(checked).toBeGreaterThan(1000);
        expect(rejected).toEqual([]);
    }, 120_000);

    test('compact stays bounded even for the widest nodes', () => {
        const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
        const sizes = Object.values<any>(ontology.nodes).map((node) =>
            TypeScriptFormatter.generateCompactNodeDoc({
                name: node.name,
                type: node.type,
                displayName: node.displayName,
                description: node.description,
                version: node.version,
                properties: node.schema?.properties ?? [],
                parameterGating: node.metadata?.parameterGating,
            }).length,
        );
        // Carrying the discriminators is worth bytes; carrying the whole schema is not.
        expect(Math.max(...sizes)).toBeLessThan(2500);
    }, 60_000);
});
