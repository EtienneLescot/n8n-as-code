#!/usr/bin/env node

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

const generatedFiles = [
  'skills/README.md',
  'skills/n8n-architect/SKILL.md',
  'plugins/claude/n8n-as-code/skills/n8n-architect/SKILL.md',
  'plugins/openclaw/n8n-as-code/skills/n8n-architect/SKILL.md',
  'plugins/cursor/n8n-as-code/skills/n8n-architect/SKILL.md',
];

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    ...options,
  });
}

function readCurrentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveDistTag() {
  const explicit = process.env.N8NAC_SKILL_ADAPTER_DIST_TAG?.trim();
  if (explicit) return explicit;

  const branch = readCurrentBranch();
  return (branch === 'next' || branch?.startsWith('release/')) ? 'next' : 'stable';
}

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const stageMode = args.includes('--stage');
const adapterArgs = checkMode ? ['--check'] : [];
const distTag = resolveDistTag();

console.log(`Building skill adapters for ${distTag === 'next' ? 'next' : 'stable'} channel...`);

// Compile only TypeScript sources needed by the adapter generator. Avoid npm's
// prebuild lifecycle here because it rebuilds the full n8n knowledge assets.
run('npx', ['tsc', '-b', 'packages/skills']);
run('node', ['packages/skills/scripts/build-skill-adapters.js', ...adapterArgs], {
  env: {
    ...process.env,
    N8NAC_SKILL_ADAPTER_DIST_TAG: distTag,
  },
});

if (stageMode && !checkMode) {
  run('git', ['add', ...generatedFiles]);
}
