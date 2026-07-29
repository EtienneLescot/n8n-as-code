#!/usr/bin/env node
/**
 * Stages generated knowledge assets and agent skills into dist/ for publishing.
 *
 * Assets are copied by explicit allowlist rather than a glob. `src/assets/` also holds
 * build intermediates — notably n8n-nodes-index.json (~28MB), which only
 * generate-credential-ontology.cjs and enrich-nodes-technical.cjs read — and a glob
 * copy leaks those into the published tarball.
 */
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcAssets = join(packageRoot, 'src', 'assets');
const srcSkills = join(packageRoot, 'src', 'agent-skills');
const distAssets = join(packageRoot, 'dist', 'assets');
const distSkills = join(packageRoot, 'dist', 'agent-skills');

/** Assets read at runtime by the published package. Keep in sync with the providers in src/services/. */
const RUNTIME_ASSETS = [
    'n8n-nodes-technical.json',
    'n8n-knowledge-index.json',
    'n8n-docs-complete.json',
    'workflows-index.json',
    'n8n-credentials-ontology.json',
];

function formatMb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// Validate before copying anything, so a partial prebuild does not leave a half-staged dist/.
const missing = RUNTIME_ASSETS.filter((asset) => !existsSync(join(srcAssets, asset)));
if (missing.length > 0) {
    console.error(
        `Missing generated assets: ${missing.join(', ')}\n` +
        'Run the generation pipeline first: npm run prebuild --workspace=packages/skills',
    );
    process.exit(1);
}

if (!existsSync(srcSkills)) {
    console.error(`Missing agent skills source directory: ${srcSkills}`);
    process.exit(1);
}

rmSync(distSkills, { recursive: true, force: true });
mkdirSync(distAssets, { recursive: true });
mkdirSync(distSkills, { recursive: true });

let copiedBytes = 0;
for (const asset of RUNTIME_ASSETS) {
    const from = join(srcAssets, asset);
    cpSync(from, join(distAssets, asset));
    copiedBytes += statSync(from).size;
}

cpSync(srcSkills, distSkills, { recursive: true });

console.log(`Staged ${RUNTIME_ASSETS.length} runtime assets (${formatMb(copiedBytes)}) and agent skills into dist/.`);
