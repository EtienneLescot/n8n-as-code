import { describe, it, expect } from 'vitest';
import { createInstanceIdentifier, isCanonicalUserInstanceIdentifier } from '../../src/core/services/directory-utils.js';

describe('directory-utils', () => {
    describe('createInstanceIdentifier', () => {
        it('uses a stable n8n user ID hash', () => {
            expect(createInstanceIdentifier({
                id: 'user-1',
                email: 'etienne@example.com',
                firstName: 'Etienne',
                lastName: 'Lescot',
            })).toBe('n8n_c6c289e49e');

            expect(createInstanceIdentifier({
                id: 'user-1',
                email: 'etienne@example.com',
                firstName: 'Etienne',
                lastName: 'Lescot',
            })).toBe('n8n_c6c289e49e');
        });

        it('accepts only canonical user identity identifiers', () => {
            expect(isCanonicalUserInstanceIdentifier('n8n_c6c289e49e')).toBe(true);
            expect(isCanonicalUserInstanceIdentifier('key_62af870476')).toBe(false);
            expect(isCanonicalUserInstanceIdentifier('invalid_identifier')).toBe(false);
            expect(isCanonicalUserInstanceIdentifier('n8n_c6c289e49e_etienne_l')).toBe(false);
        });

        it('fails when the stable n8n user ID is unavailable', () => {
            expect(() => createInstanceIdentifier({
                email: 'etienne@example.com',
            })).toThrow('n8n user ID is missing');
        });
    });
});
