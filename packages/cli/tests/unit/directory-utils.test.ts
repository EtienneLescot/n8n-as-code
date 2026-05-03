import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiKeyInstanceIdentifier, createHostSlug, createInstanceIdentifier, isLegacyLocalInstanceIdentifier } from '../../src/core/services/directory-utils.js';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('directory-utils', () => {
    describe('createHostSlug', () => {
        it('creates slug for local ip address', () => {
            expect(createHostSlug('192.168.1.1')).toBe('192_168_1_1');
        });

        it('normalizes localhost with port', () => {
            expect(createHostSlug('localhost:5678')).toBe('local_5678');
            expect(createHostSlug('http://localhost:5678')).toBe('local_5678');
        });

        it('keeps known domain simplification behavior', () => {
            expect(createHostSlug('etiennel.app.n8n.cloud')).toBe('etiennel_cloud');
            expect(createHostSlug('prod.example.com')).toBe('prod_example');
        });

        it('strips common tlds and normalizes separators', () => {
            expect(createHostSlug('https://my-test.domain.io/')).toBe('my_test_domain');
            expect(createHostSlug('https://service-name.example.net')).toBe('service_name_example');
            expect(createHostSlug('ACME-TEAM.ORG')).toBe('acme_team_org');
        });

        it('preserves non-localhost ports on linux/mac behavior', () => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

            expect(createHostSlug('http://192.168.1.1:5679')).toBe('192_168_1_1:5679');
            expect(createHostSlug('https://demo.example.com:5679')).toBe('demo_example_com:5679');
        });

        it('replaces colon on windows for non-localhost hosts', () => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

            expect(createHostSlug('http://192.168.1.1:5679')).toBe('192_168_1_1_5679');
            expect(createHostSlug('https://demo.example.com:5679')).toBe('demo_example_com_5679');
        });

        it('keeps localhost shortcut behavior on windows', () => {
            vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

            expect(createHostSlug('localhost:9999')).toBe('local_9999');
        });
    });

    describe('createInstanceIdentifier', () => {
        it('uses a stable n8n user ID hash instead of the host slug when available', () => {
            expect(createInstanceIdentifier('http://localhost:5678', {
                id: 'user-1',
                email: 'etienne@example.com',
                firstName: 'Etienne',
                lastName: 'Lescot',
            })).toBe('n8n_c6c289e49e_etienne_l');

            expect(createInstanceIdentifier('https://changed.example.com', {
                id: 'user-1',
                email: 'etienne@example.com',
                firstName: 'Etienne',
                lastName: 'Lescot',
            })).toBe('n8n_c6c289e49e_etienne_l');
        });

        it('detects legacy local instance identifiers', () => {
            expect(isLegacyLocalInstanceIdentifier('local_1234_etienne_test')).toBe(true);
            expect(isLegacyLocalInstanceIdentifier('n8n_c6c289e49e_etienne_l')).toBe(false);
            expect(isLegacyLocalInstanceIdentifier('key_62af870476')).toBe(false);
        });

        it('fails when the stable n8n user ID is unavailable', () => {
            expect(() => createInstanceIdentifier('http://localhost:5678', {
                email: 'etienne@example.com',
            })).toThrow('n8n user ID is missing');
        });

        it('creates a hostless API-key fallback identifier', () => {
            expect(createApiKeyInstanceIdentifier('test-key')).toBe('key_62af870476');
        });
    });
});
