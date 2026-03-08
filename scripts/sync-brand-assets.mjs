#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sourceLogo = path.join(repoRoot, 'res', 'logo.png');
const generatedTargets = [
  path.join(repoRoot, 'docs', 'static', 'img', 'logo.png'),
];

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(repoRoot, filePath)}`);
  }
}

function copyIfChanged(sourcePath, targetPath) {
  const source = fs.readFileSync(sourcePath);
  const targetExists = fs.existsSync(targetPath);
  const target = targetExists ? fs.readFileSync(targetPath) : null;

  if (targetExists && Buffer.compare(source, target) === 0) {
    return false;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, source);
  return true;
}

ensureFileExists(sourceLogo);

let changedCount = 0;

for (const target of generatedTargets) {
  if (copyIfChanged(sourceLogo, target)) {
    changedCount += 1;
    console.log(`Synced ${path.relative(repoRoot, target)}`);
  }
}

if (changedCount === 0) {
  console.log('Brand assets already up to date.');
}