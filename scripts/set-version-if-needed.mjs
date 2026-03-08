#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

const targetVersion = getArg('--target');
const packageJsonPath = getArg('--package-json') ?? 'package.json';
const workspacePath = getArg('--workspace');

if (!targetVersion) {
  console.error('Missing required --target argument.');
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

if (currentVersion === targetVersion) {
  console.log(`Version already set to ${targetVersion}, skipping version update.`);
  process.exit(0);
}

const args = ['version', targetVersion, '--no-git-tag-version'];
if (workspacePath) {
  args.push(`--workspace=${workspacePath}`);
}

const result = spawnSync('npm', args, { stdio: 'inherit' });
if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);