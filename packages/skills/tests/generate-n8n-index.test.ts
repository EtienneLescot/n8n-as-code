import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Load the CJS script functions via createRequire so they are testable without
// running the full script (which needs the .n8n-cache directory).
const require = createRequire(import.meta.url);
const scriptPath = path.resolve(_dirname, '../../../scripts/generate-n8n-index.cjs');
const { loadModule, extractDescription } = require(scriptPath);

// ── extractDescription ─────────────────────────────────────────────────────

describe('extractDescription()', () => {
    it('returns null for an empty module', () => {
        expect(extractDescription({})).toBeNull();
    });

    it('Strategy A – extracts static description from a class', () => {
        const desc = { name: 'myNode', displayName: 'My Node', properties: [] };
        class MyNode {}
        (MyNode as any).description = desc;
        const result = extractDescription({ MyNode });
        expect(result).toBe(desc);
    });

    it('Strategy A – extracts instance description from a class', () => {
        const desc = { name: 'myNode', displayName: 'My Node', properties: [] };
        class MyNode {
            description = desc;
        }
        const result = extractDescription({ MyNode });
        expect(result).toEqual(desc);
    });

    it('Strategy A – extracts description from a versioned node (nodeVersions)', () => {
        const desc = { name: 'versionedNode', displayName: 'Versioned Node', properties: [] };
        class VersionedNode {
            defaultVersion = 2;
            nodeVersions: Record<number, any> = {
                1: { description: { name: 'versionedNode', displayName: 'V1' } },
                2: { description: desc },
            };
        }
        const result = extractDescription({ VersionedNode });
        expect(result?.name).toBe('versionedNode');
        expect(result?.displayName).toBe('Versioned Node');
        // allVersions should be populated
        expect(result?.allVersions).toEqual([1, 2]);
    });

    it('Strategy A – falls back to first version key when defaultVersion is missing', () => {
        const desc = { name: 'fallbackNode', displayName: 'Fallback Node', properties: [] };
        class FallbackNode {
            nodeVersions: Record<string, any> = {
                '1': { description: desc },
            };
        }
        const result = extractDescription({ FallbackNode });
        expect(result?.name).toBe('fallbackNode');
    });

    it('Strategy B – extracts description from a plain object export', () => {
        const desc = { name: 'plainNode', displayName: 'Plain Node', properties: [{ name: 'url' }] };
        const plainExport = { description: desc };
        const result = extractDescription({ plainExport });
        expect(result).toBe(desc);
    });

    it('returns null when no strategy matches', () => {
        const result = extractDescription({ foo: 42, bar: 'string', baz: null });
        expect(result).toBeNull();
    });

    it('skips non-class functions without prototype', () => {
        // Arrow functions have no prototype — should not throw, should fall through
        const result = extractDescription({ arrowFn: () => ({ description: { name: 'x' } }) });
        expect(result).toBeNull();
    });
});

// ── loadModule ────────────────────────────────────────────────────────────

describe('loadModule()', () => {
    let tmpDir: string;

    beforeAll(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-test-'));
    });

    afterAll(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads a CJS module successfully', async () => {
        const cjsFile = path.join(tmpDir, 'cjs-node.node.js');
        fs.writeFileSync(cjsFile, `
            module.exports = {
                MyNode: class MyNode {
                    get description() { return { name: 'myNode', displayName: 'My Node', properties: [] }; }
                }
            };
        `);
        const mod = await loadModule(cjsFile);
        expect(mod).toBeDefined();
        expect(typeof mod.MyNode).toBe('function');
    });

    it('throws for completely invalid files', async () => {
        const badFile = path.join(tmpDir, 'bad.node.js');
        fs.writeFileSync(badFile, 'THIS IS NOT VALID JS !!!@#$%^&*(');
        await expect(loadModule(badFile)).rejects.toThrow();
    });

    it('throws when the file does not exist', async () => {
        await expect(loadModule(path.join(tmpDir, 'nonexistent.node.js'))).rejects.toThrow();
    });
});
