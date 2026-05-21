import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(packageDir, 'out');

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function removeSourceMaps(directory) {
  let removedFiles = 0;
  let removedBytes = 0;

  if (!fs.existsSync(directory)) {
    return { removedFiles, removedBytes };
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const result = removeSourceMaps(entryPath);
      removedFiles += result.removedFiles;
      removedBytes += result.removedBytes;
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.map')) {
      continue;
    }

    const { size } = fs.statSync(entryPath);
    fs.rmSync(entryPath, { force: true });
    removedFiles += 1;
    removedBytes += size;
  }

  return { removedFiles, removedBytes };
}

const result = removeSourceMaps(outDir);

console.log(
  `Pruned ${result.removedFiles} source map files from out/ (${formatBytes(result.removedBytes)} uncompressed).`
);
