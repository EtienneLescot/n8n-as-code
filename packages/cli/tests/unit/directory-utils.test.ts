import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHostSlug } from '../../src/core/services/directory-utils.js';

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
});
