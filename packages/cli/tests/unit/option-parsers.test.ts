import { describe, expect, it } from 'vitest';
import { parsePositiveIntegerOption } from '../../src/utils/option-parsers.js';

describe('parsePositiveIntegerOption', () => {
    it('accepts positive integer strings', () => {
        expect(parsePositiveIntegerOption('10', '--limit')).toBe(10);
        expect(parsePositiveIntegerOption('001', '--limit')).toBe(1);
    });

    it('rejects malformed or non-positive values', () => {
        for (const value of ['10abc', '1.5', '-3', '0', 'abc']) {
            expect(() => parsePositiveIntegerOption(value, '--limit')).toThrow('--limit must be a positive integer.');
        }
    });
});
