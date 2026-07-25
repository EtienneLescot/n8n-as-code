/**
 * Stages the non-TypeScript build outputs: JSON assets and the canonical agent
 * skill sources that `build-skill-adapters.js` reads from `dist/`.
 *
 * This used to be an inline `rm -rf && mkdir -p && cp` chain in package.json.
 * npm runs lifecycle scripts through cmd.exe on Windows, where `mkdir -p` hits
 * the shell builtin and fails, so the whole pre-commit adapter chain died there.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(packageDir, 'dist');
const agentSkillsDist = path.join(distDir, 'agent-skills');
const assetsDist = path.join(distDir, 'assets');

// Rebuilt from scratch so a renamed or deleted skill does not linger in dist.
fs.rmSync(agentSkillsDist, { recursive: true, force: true });
fs.mkdirSync(agentSkillsDist, { recursive: true });
fs.mkdirSync(assetsDist, { recursive: true });

// `src/assets` is gitignored and produced by `prebuild`, so it is absent on a
// checkout that has never run a full build. The agent-skill staging below is
// what the pre-commit adapter chain needs, and it must not be held hostage to
// the multi-minute node/docs indexing — warn and carry on instead.
const assetsSrc = path.join(packageDir, 'src', 'assets');
if (fs.existsSync(assetsSrc)) {
  for (const entry of fs.readdirSync(assetsSrc)) {
    if (!entry.endsWith('.json')) continue;
    fs.copyFileSync(path.join(assetsSrc, entry), path.join(assetsDist, entry));
  }
} else {
  console.warn(
    '[skills postbuild] src/assets is missing, so no JSON assets were staged into dist/assets. ' +
    'Run "npm run prebuild --workspace=packages/skills" to generate them before publishing.'
  );
}

fs.cpSync(path.join(packageDir, 'src', 'agent-skills'), agentSkillsDist, { recursive: true });
