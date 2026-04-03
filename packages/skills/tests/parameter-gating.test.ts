import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { TypeScriptFormatter } from '../src/services/typescript-formatter.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

const require = createRequire(import.meta.url);
const enrichScript = require(path.resolve(_dirname, '../../../scripts/enrich-nodes-technical.cjs'));
const { computeParameterGating } = enrichScript;

// ── computeParameterGating ────────────────────────────────────────────────

describe('computeParameterGating()', () => {
    it('returns empty array for empty properties', () => {
        expect(computeParameterGating([])).toEqual([]);
        expect(computeParameterGating(null)).toEqual([]);
        expect(computeParameterGating(undefined)).toEqual([]);
    });

    it('returns empty array when no boolean params exist', () => {
        const props = [
            { name: 'url', type: 'string', default: '' },
            { name: 'method', type: 'options', default: 'GET', options: [] },
        ];
        expect(computeParameterGating(props)).toEqual([]);
    });

    it('returns empty array when boolean has no gated params', () => {
        const props = [
            { name: 'verbose', type: 'boolean', default: false },
            { name: 'url', type: 'string', default: '' },
        ];
        expect(computeParameterGating(props)).toEqual([]);
    });

    it('ignores booleans with default: true', () => {
        const props = [
            { name: 'enabled', type: 'boolean', default: true },
            {
                name: 'secret',
                type: 'string',
                default: '',
                displayOptions: { show: { enabled: [true] } },
            },
        ];
        // default:true booleans are not tracked (they are always-on)
        expect(computeParameterGating(props)).toEqual([]);
    });

    it('detects a simple boolean that gates another param', () => {
        const props = [
            { name: 'showAdvanced', type: 'boolean', default: false, displayName: 'Show Advanced' },
            {
                name: 'timeout',
                type: 'number',
                default: 30,
                displayOptions: { show: { showAdvanced: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        expect(result).toHaveLength(1);
        expect(result[0].flag).toBe('showAdvanced');
        expect(result[0].flagDisplay).toBe('Show Advanced');
        expect(result[0].default).toBe(false);
        expect(result[0].gatedParams).toContain('timeout');
        expect(result[0].aiConnectionType).toBeNull();
    });

    it('detects an AI connection type from a notice gated by the boolean', () => {
        const props = [
            {
                name: 'hasOutputParser',
                type: 'boolean',
                default: false,
                displayName: 'Require Specific Output Format',
            },
            {
                name: 'notice',
                type: 'notice',
                default: '',
                displayName: "Connect an <a data-action='openSelectiveNodeCreator' data-action-parameter-connectiontype='ai_outputParser'>output parser</a> on the canvas",
                displayOptions: { show: { hasOutputParser: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        expect(result).toHaveLength(1);
        expect(result[0].flag).toBe('hasOutputParser');
        expect(result[0].aiConnectionType).toBe('ai_outputParser');
    });

    it('handles multiple gating booleans on the same node', () => {
        const props = [
            { name: 'hasOutputParser', type: 'boolean', default: false, displayName: 'Require Output Format' },
            { name: 'needsFallback', type: 'boolean', default: false, displayName: 'Enable Fallback' },
            {
                name: 'parserNotice',
                type: 'notice',
                default: '',
                displayName: "data-action-parameter-connectiontype='ai_outputParser'",
                displayOptions: { show: { hasOutputParser: [true] } },
            },
            {
                name: 'fallbackNotice',
                type: 'notice',
                default: '',
                displayName: 'Connect a fallback model',
                displayOptions: { show: { needsFallback: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        expect(result).toHaveLength(2);

        const parserGating = result.find(r => r.flag === 'hasOutputParser')!;
        expect(parserGating.aiConnectionType).toBe('ai_outputParser');

        const fallbackGating = result.find(r => r.flag === 'needsFallback')!;
        expect(fallbackGating.aiConnectionType).toBeNull();
    });

    it('does not include the boolean itself in gatedParams', () => {
        const props = [
            { name: 'toggle', type: 'boolean', default: false, displayName: 'Toggle' },
            {
                name: 'extra',
                type: 'string',
                default: '',
                displayOptions: { show: { toggle: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        expect(result[0].gatedParams).not.toContain('toggle');
        expect(result[0].gatedParams).toContain('extra');
    });

    it('detects AI connection type from double-quoted attribute', () => {
        const props = [
            { name: 'hasOutputParser', type: 'boolean', default: false, displayName: 'Require Output Format' },
            {
                name: 'notice',
                type: 'notice',
                default: '',
                displayName: 'Connect an <a data-action-parameter-connectiontype="ai_outputParser">output parser</a>',
                displayOptions: { show: { hasOutputParser: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        expect(result).toHaveLength(1);
        expect(result[0].aiConnectionType).toBe('ai_outputParser');
    });

    it('deduplicates gating entries when the same boolean appears multiple times in properties', () => {
        // Real-world: n8n node properties repeat params across resource/operation display variants
        const props = [
            { name: 'hasOutputParser', type: 'boolean', default: false, displayName: 'Require Output Format' },
            { name: 'hasOutputParser', type: 'boolean', default: false, displayName: 'Require Output Format' },
            {
                name: 'notice',
                type: 'notice',
                default: '',
                displayName: "data-action-parameter-connectiontype='ai_outputParser'",
                displayOptions: { show: { hasOutputParser: [true] } },
            },
            {
                name: 'notice',
                type: 'notice',
                default: '',
                displayName: "data-action-parameter-connectiontype='ai_outputParser'",
                displayOptions: { show: { hasOutputParser: [true] } },
            },
        ];
        const result = computeParameterGating(props);
        // Must produce exactly one entry, not two
        expect(result).toHaveLength(1);
        expect(result[0].flag).toBe('hasOutputParser');
        // gatedParams must not contain duplicate entries
        expect(result[0].gatedParams).toEqual(['notice']);
    });

    it('returns gatedParams as a sorted list', () => {
        const props = [
            { name: 'flag', type: 'boolean', default: false, displayName: 'Flag' },
            { name: 'zebra', type: 'string', default: '', displayOptions: { show: { flag: [true] } } },
            { name: 'alpha', type: 'string', default: '', displayOptions: { show: { flag: [true] } } },
        ];
        const result = computeParameterGating(props);
        expect(result[0].gatedParams).toEqual(['alpha', 'zebra']);
    });

    it('excludes params gated by multiple conditions (not solely by the boolean)', () => {
        // A param with show: { flag: [true], otherCondition: ['value'] } is only visible
        // when BOTH conditions are met — it should not appear in gatedParams for 'flag' alone
        const props = [
            { name: 'flag', type: 'boolean', default: false, displayName: 'Flag' },
            { name: 'soloGated', type: 'string', default: '', displayOptions: { show: { flag: [true] } } },
            { name: 'multiGated', type: 'string', default: '', displayOptions: { show: { flag: [true], otherCondition: ['value'] } } },
        ];
        const result = computeParameterGating(props);
        expect(result).toHaveLength(1);
        expect(result[0].gatedParams).toContain('soloGated');
        expect(result[0].gatedParams).not.toContain('multiGated');
    });
});

// ── TypeScriptFormatter — parameterGating section ────────────────────────

describe('TypeScriptFormatter.generateCompleteNodeDoc() — parameterGating', () => {
    const baseSchema = {
        name: 'agent',
        type: '@n8n/n8n-nodes-langchain.agent',
        displayName: 'AI Agent',
        description: 'Run an AI agent',
        version: 2,
        properties: [],
        metadata: {},
    };

    it('omits the gating section when parameterGating is absent', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc(baseSchema);
        expect(doc).not.toContain('Conditional boolean flags');
    });

    it('omits the gating section when parameterGating is empty', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc({ ...baseSchema, parameterGating: [] });
        expect(doc).not.toContain('Conditional boolean flags');
    });

    it('renders a gating entry linked to an AI connection type', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc({
            ...baseSchema,
            parameterGating: [
                {
                    flag: 'hasOutputParser',
                    flagDisplay: 'Require Specific Output Format',
                    default: false,
                    gatedParams: ['notice'],
                    aiConnectionType: 'ai_outputParser',
                },
            ],
        });
        expect(doc).toContain('Conditional boolean flags');
        expect(doc).toContain('hasOutputParser: true');
        expect(doc).toContain('.uses({ ai_outputParser: ... })');
        expect(doc).toContain('Require Specific Output Format');
    });

    it('renders a gating entry without an AI connection type', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc({
            ...baseSchema,
            parameterGating: [
                {
                    flag: 'needsFallback',
                    flagDisplay: 'Enable Fallback Model',
                    default: false,
                    gatedParams: ['fallbackNotice'],
                    aiConnectionType: null,
                },
            ],
        });
        expect(doc).toContain('Conditional boolean flags');
        expect(doc).toContain('needsFallback: true');
        expect(doc).toContain('fallbackNotice');
        expect(doc).toContain('Enable Fallback Model');
    });

    it('renders multiple gating entries', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc({
            ...baseSchema,
            parameterGating: [
                { flag: 'hasOutputParser', flagDisplay: 'Output Format', default: false, gatedParams: ['notice'], aiConnectionType: 'ai_outputParser' },
                { flag: 'needsFallback', flagDisplay: 'Fallback Model', default: false, gatedParams: ['fallbackNotice'], aiConnectionType: null },
            ],
        });
        expect(doc).toContain('hasOutputParser: true');
        expect(doc).toContain('needsFallback: true');
    });

    it('truncates a long gatedParams list with "+X more" suffix', () => {
        const doc = TypeScriptFormatter.generateCompleteNodeDoc({
            ...baseSchema,
            parameterGating: [
                {
                    flag: 'jsonParameters',
                    flagDisplay: 'JSON Parameters',
                    default: false,
                    gatedParams: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
                    aiConnectionType: null,
                },
            ],
        });
        expect(doc).toContain('a, b, c, d, e (+2 more)');
        expect(doc).not.toContain('a, b, c, d, e, f, g');
    });
});
