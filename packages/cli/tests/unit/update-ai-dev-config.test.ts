import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

function readStringArrayConstant(filePath: string, constantName: string): string[] {
    const source = readFileSync(filePath, 'utf8');
    const match = source.match(new RegExp(`const ${constantName} = \\[([\\s\\S]*?)\\]`));
    if (!match) {
        throw new Error(`Unable to find ${constantName} in ${filePath}`);
    }
    return [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
}

describe('update-ai dev config filenames', () => {
    it('stays in sync with the skills CLI command resolver', () => {
        const cliFilenames = readStringArrayConstant(
            path.join(repoRoot, 'packages/cli/src/commands/update-ai.ts'),
            'N8NAC_DEV_CONFIG_FILENAMES',
        );
        const skillsFilenames = readStringArrayConstant(
            path.join(repoRoot, 'packages/skills/src/services/cli-command-resolver.ts'),
            'DEV_CONFIG_FILENAMES',
        );

        expect(cliFilenames).toEqual(skillsFilenames);
    });
});
