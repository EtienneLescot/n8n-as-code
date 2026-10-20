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

    /**
     * A cap that is not a finite non-negative number must not reshape the output silently.
     * `maxRequired: NaN` used to drop every required line AND suppress the "+N more"
     * marker, so a caller could not tell anything was missing; a negative cap fed
     * `slice(0, -3)` and trimmed from the wrong end; `maxDesc: 0` printed all but the last
     * character of the description.
     */
    test.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['negative', -3],
    ])('a %s cap falls back to the default instead of truncating silently', (_label, value) => {
        const compact = TypeScriptFormatter.generateCompactNodeDoc(bigSchema as any, { maxRequired: value as number });
        const withDefaults = TypeScriptFormatter.generateCompactNodeDoc(bigSchema as any);
        expect(compact).toEqual(withDefaults);
    });

    test('a zero cap drops everything but still says so', () => {
        const compact = TypeScriptFormatter.generateCompactNodeDoc(bigSchema as any, { maxRequired: 0, maxDesc: 0 });
        // Assert on the required entries themselves: the gating-flag block below uses the
        // same `//   - ` prefix, so a prefix match would pass for the wrong reason.
        expect(compact).not.toMatch(/^\/\/   - param0:/m);
        expect(compact).not.toMatch(/^\/\/   - param1:/m);
        // The reader must be able to tell the list was emptied, not that it was empty.
        expect(compact).toMatch('more required');
        expect(compact).not.toMatch('Consume the Gmail API');
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

    test('projects current ungated options and multiOptions into the compact snippet', () => {
        const schema = {
            name: 'merge',
            type: 'n8n-nodes-base.merge',
            displayName: 'Merge',
            description: 'Merge items',
            version: [1, 2],
            properties: [
                { name: 'resource', type: 'options', options: [{ value: 'input' }] },
                { name: 'operation', type: 'options', options: [{ value: 'chooseBranch' }] },
                {
                    name: 'mode',
                    type: 'options',
                    displayOptions: { show: { '@version': [1] } },
                    options: [{ value: 'obsolete' }],
                },
                {
                    name: 'mode',
                    type: 'options',
                    displayOptions: { show: { '@version': [2] } },
                    options: [{ value: 'append' }, { value: 'combine' }],
                },
                {
                    name: 'mode',
                    type: 'options',
                    displayOptions: { show: { '@version': [2] } },
                    options: [{ value: 'combine' }, { value: 'combineBySql' }],
                },
                {
                    name: 'mode',
                    type: 'options',
                    displayOptions: { show: { resource: ['input'] } },
                    options: [{ value: 'gated' }],
                },
                {
                    name: 'fields',
                    type: 'multiOptions',
                    displayOptions: { show: { '@version': [2] } },
                    options: [{ value: 'id' }, { value: 'name' }],
                },
                {
                    name: 'stale',
                    type: 'options',
                    displayOptions: { hide: { '@version': [2] } },
                    options: [{ value: 'old' }],
                },
            ],
        };

        const doc = TypeScriptFormatter.generateCompactNodeDoc(schema as any, { maxEnum: 3 });

        expect(doc).toContain('// mode: append | combine | combineBySql');
        expect(doc).toContain('// fields: id | name');
        expect(doc).toContain('  mode: "append",');
        expect(doc).toContain('  fields: ["id"],');
        expect(doc).not.toContain('obsolete');
        expect(doc).not.toContain('gated');
        expect(doc).not.toContain('stale');
        expect(doc.match(/^\/\/ mode:/gm)).toHaveLength(1);
    });

    test('caps general option values while retaining a usable first value', () => {
        const schema = {
            name: 'merge',
            type: 'n8n-nodes-base.merge',
            displayName: 'Merge',
            description: 'Merge items',
            version: 1,
            properties: [{
                name: 'mode',
                type: 'options',
                options: [
                    { value: 'append' },
                    { value: 'combine' },
                    { value: 'combineBySql' },
                    { value: 'chooseBranch' },
                ],
            }],
        };

        const doc = TypeScriptFormatter.generateCompactNodeDoc(schema as any, { maxEnum: 2 });

        expect(doc).toContain('// mode: append | combine | +2 more');
        expect(doc).toContain('  mode: "append",');
        expect(doc).not.toContain("  mode: ['append']");
    });

    test('preserves literal option values in the snippet', () => {
        const schema = {
            name: 'example',
            type: 'n8n-nodes-base.example',
            displayName: 'Example',
            description: 'Example node',
            version: 1,
            properties: [
                { name: 'attempts', type: 'options', options: [{ value: 2 }] },
                { name: 'flags', type: 'multiOptions', options: [{ value: false }] },
                { name: 'label', type: 'options', options: [{ value: "O'Reilly\n" }] },
            ],
        };

        const doc = TypeScriptFormatter.generateCompactNodeDoc(schema as any);

        expect(doc).toContain('  attempts: 2,');
        expect(doc).toContain('  flags: [false],');
        expect(doc).toContain("  label: \"O'Reilly\\n\",");
    });

    test.each([
        ['no disabledOptions stays enabled', undefined, true],
        ['disabled on an old version stays enabled', { show: { '@version': [1] } }, true],
        ['disabled on the current version is excluded', { show: { '@version': [2] } }, false],
        ['disabled by a current-version comparator is excluded', { show: { '@version': [{ _cnd: { gte: 2 } }] } }, false],
        ['current-version disabled hide stays enabled', { hide: { '@version': [2] } }, true],
        ['other-version disabled hide is excluded', { hide: { '@version': [1] } }, false],
        ['empty disabledOptions stays conservatively excluded', {}, false],
        ['empty show with current hide stays enabled', { show: {}, hide: { '@version': [2] } }, true],
        ['empty maps stay conservatively excluded', { show: {}, hide: {} }, false],
        ['old show with empty hide stays enabled', { show: { '@version': [1] }, hide: {} }, true],
        ['parameter-dependent disabled state stays excluded', { show: { resource: ['input'] } }, false],
        ['malformed disabledOptions stays conservatively excluded', { show: 'invalid' }, false],
    ])('handles %s', (_label, disabledOptions, expected) => {
        const doc = TypeScriptFormatter.generateCompactNodeDoc({
            name: 'versioned',
            type: 'n8n-nodes-base.versioned',
            displayName: 'Versioned',
            description: 'Versioned node',
            version: [1, 2],
            properties: [{
                name: 'choice',
                type: 'options',
                disabledOptions,
                options: [{ value: 'enabled' }],
            }],
        } as any);
        const hasProjection = doc.includes('// choice:') && /\n  choice:\s/.test(doc);
        expect(hasProjection).toBe(expected);
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

    test('every node with an applicable ungated enum projects its first field', () => {
        const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
        let checked = 0;

        for (const node of Object.values<any>(ontology.nodes)) {
            if (!node.type) continue;
            const firstUngated = (node.schema?.properties ?? []).find((prop: any) => {
                const type = String(prop.type || '').toLowerCase();
                const displayOptions = prop.displayOptions;
                const gated = displayOptions && (Object.keys(displayOptions.show ?? {}).length > 0 ||
                    Object.keys(displayOptions.hide ?? {}).length > 0);
                return (type === 'options' || type === 'multioptions') &&
                    Array.isArray(prop.options) && prop.options.length > 0 &&
                    prop.name !== 'resource' && prop.name !== 'operation' &&
                    !gated;
            });
            if (!firstUngated) continue;
            const doc = TypeScriptFormatter.generateCompactNodeDoc({
                name: node.name,
                type: node.type,
                displayName: node.displayName,
                description: node.description,
                version: node.version,
                properties: node.schema?.properties ?? [],
                parameterGating: node.metadata?.parameterGating,
            });
            expect(doc).toContain(`// ${firstUngated.name}:`);
            const fieldName = String(firstUngated.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            expect(doc).toMatch(new RegExp(`\\n  (?:${fieldName}|['"]${fieldName}['"]):\\s`));
            expect(doc).not.toContain('= { /* parameters */ };');
            checked++;
        }

        expect(checked).toBeGreaterThan(100);
    });

    test('bundled Merge projects its mode values into compact output', () => {
        const ontology = JSON.parse(fs.readFileSync(ontologyPath, 'utf8'));
        const node = ontology.nodes.merge;
        const doc = TypeScriptFormatter.generateCompactNodeDoc({
            name: node.name,
            type: node.type,
            displayName: node.displayName,
            description: node.description,
            version: node.version,
            properties: node.schema?.properties ?? [],
            parameterGating: node.metadata?.parameterGating,
        });

        expect(doc).toContain('// mode: append | combine | combineBySql | chooseBranch');
        expect(doc).toContain('  mode: "append",');
    });

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
