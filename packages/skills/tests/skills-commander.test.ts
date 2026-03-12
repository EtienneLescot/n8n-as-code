import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveCustomNodesConfig } from '../src/services/custom-nodes-config';

describe('resolveCustomNodesConfig', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-skills-'));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test('resolves customNodesPath from n8nac-config.json', () => {
        const customNodesPath = path.join(tempDir, 'config', 'custom-nodes.json');
        fs.mkdirSync(path.dirname(customNodesPath), { recursive: true });
        fs.writeFileSync(customNodesPath, JSON.stringify({ nodes: {} }));
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './config/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('config');
        expect(result.resolvedPath).toBe(customNodesPath);
        expect(result.warnings).toEqual([]);
    });

    test('warns when configured customNodesPath does not exist', () => {
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './missing/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('none');
        expect(result.resolvedPath).toBeUndefined();
        expect(result.warnings[0]).toMatch(/Configured customNodesPath was not found/);
    });

    test('falls back to the default sidecar file when configured path is missing', () => {
        const defaultPath = path.join(tempDir, 'n8nac-custom-nodes.json');
        fs.writeFileSync(defaultPath, JSON.stringify({ nodes: {} }));
        fs.writeFileSync(path.join(tempDir, 'n8nac-config.json'), JSON.stringify({
            customNodesPath: './missing/custom-nodes.json'
        }));

        const result = resolveCustomNodesConfig(tempDir);

        expect(result.source).toBe('default');
        expect(result.resolvedPath).toBe(defaultPath);
        expect(result.warnings[0]).toMatch(/Configured customNodesPath was not found/);
    });
});
