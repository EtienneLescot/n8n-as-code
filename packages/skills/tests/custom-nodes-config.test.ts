import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveCustomNodesConfig } from '../src/services/custom-nodes-config.js';

describe('resolveCustomNodesConfig', () => {
    it('finds the default sidecar at the workspace root when run from a subdirectory', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-sidecar-'));
        try {
            fs.writeFileSync(path.join(root, 'n8nac-custom-nodes.json'), '{}');
            const nested = path.join(root, 'workflows', 'team');
            fs.mkdirSync(nested, { recursive: true });

            const resolution = resolveCustomNodesConfig(nested);
            expect(resolution.source).toBe('default');
            expect(resolution.resolvedPath).toBe(path.join(root, 'n8nac-custom-nodes.json'));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('resolves customNodesPath relative to the directory holding n8nac-config.json', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-config-'));
        try {
            fs.writeFileSync(path.join(root, 'n8nac-config.json'), JSON.stringify({ customNodesPath: 'custom/my-nodes.json' }));
            const customDir = path.join(root, 'custom');
            fs.mkdirSync(customDir, { recursive: true });
            fs.writeFileSync(path.join(customDir, 'my-nodes.json'), '{}');
            const nested = path.join(root, 'workflows');
            fs.mkdirSync(nested, { recursive: true });

            const resolution = resolveCustomNodesConfig(nested);
            expect(resolution.source).toBe('config');
            expect(resolution.resolvedPath).toBe(path.join(customDir, 'my-nodes.json'));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('reports none when no sidecar exists up the tree', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-empty-'));
        try {
            const resolution = resolveCustomNodesConfig(root);
            expect(resolution.source).toBe('none');
            expect(resolution.cwd).toBe(path.resolve(root));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
