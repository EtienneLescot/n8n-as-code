import { describe, expect, it } from 'vitest';
import { effectiveNativeMcpLevel } from '../../src/services/config-service.js';
import { parseLevelOption } from '../../src/utils/option-parsers.js';

describe('effectiveNativeMcpLevel', () => {
    it('returns 0 without configuration', () => {
        expect(effectiveNativeMcpLevel(undefined)).toBe(0);
        expect(effectiveNativeMcpLevel(undefined, '')).toBe(0);
    });

    it('an explicit disable always wins over a stored level', () => {
        expect(effectiveNativeMcpLevel({ enabled: false, level: 3 })).toBe(0);
        expect(effectiveNativeMcpLevel({ enabled: false, url: 'https://n8n.test/mcp-server/http', level: 2 })).toBe(0);
    });

    it('honours an explicitly stored level', () => {
        expect(effectiveNativeMcpLevel({ enabled: true, level: 1 })).toBe(1);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 2 })).toBe(2);
    });

    it('falls back to the full legacy surface without an explicit level', () => {
        expect(effectiveNativeMcpLevel({ enabled: true })).toBe(3);
        expect(effectiveNativeMcpLevel({ url: 'https://n8n.test/mcp-server/http' })).toBe(3);
    });

    it('honours a strict env override, including 0', () => {
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '1')).toBe(1);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '0')).toBe(0);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, ' 2 ')).toBe(2);
    });

    it('ignores malformed env overrides instead of truncating them', () => {
        // parseInt-style truncation ("2foo" -> 2, "2.5" -> 2) must not apply.
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '2foo')).toBe(3);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '2.5')).toBe(3);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '4')).toBe(3);
        expect(effectiveNativeMcpLevel({ enabled: true, level: 3 }, '-1')).toBe(3);
        expect(effectiveNativeMcpLevel(undefined, '2foo')).toBe(0);
    });
});

describe('parseLevelOption', () => {
    it('accepts 1-3', () => {
        expect(parseLevelOption('1', '--level')).toBe(1);
        expect(parseLevelOption('2', '--level')).toBe(2);
        expect(parseLevelOption(' 3 ', '--level')).toBe(3);
    });

    it('rejects partial numerics and out-of-range values', () => {
        for (const bad of ['2foo', '2.5', '0', '4', '-1', '', 'two']) {
            expect(() => parseLevelOption(bad, '--level')).toThrow();
        }
    });
});
