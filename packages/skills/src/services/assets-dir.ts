import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = dirname(_filename as string);

/**
 * Locate the generated knowledge assets.
 *
 * Resolved against this module's own directory, so it is correct for every consumer that
 * imports the skills package — the unified CLI, the MCP server, or the VS Code extension —
 * in the monorepo and in a published install alike.
 *
 * This file lives one level below the package's dist root (dist/services/), so every
 * candidate is one `..` deeper than the equivalent path would be from dist/.
 */
export function resolveSkillsAssetsDir(): string {
    const hasRequiredAssets = (candidate: string): boolean => (
        fs.existsSync(join(candidate, 'n8n-nodes-technical.json'))
        && fs.existsSync(join(candidate, 'workflows-index.json'))
    );

    if (process.env.N8N_AS_CODE_ASSETS_DIR && hasRequiredAssets(process.env.N8N_AS_CODE_ASSETS_DIR)) {
        return process.env.N8N_AS_CODE_ASSETS_DIR;
    }

    // Standard install (dist/services/ -> dist/assets/) or dev (src/services/ -> src/assets/).
    const localAssets = join(_dirname, '../assets');
    if (hasRequiredAssets(localAssets)) {
        return localAssets;
    }

    const candidates = [
        join(_dirname, '../../../assets'),
        join(_dirname, '../../../vscode-extension/assets'),
        join(_dirname, '../../dist/assets'),
    ];
    return candidates.find(hasRequiredAssets) || candidates[0];
}
