#!/usr/bin/env node
/**
 * Fails the build when a package copied into `out/node_modules` cannot resolve one of its
 * required dependencies. Runs against the build output directly, so a packaging regression
 * surfaces during `npm run build` instead of after the VSIX is published.
 *
 * `smoke-vsix-runtime.mjs` reuses the same check against an unpacked VSIX.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { collectRequiredDependencyNames, HOST_PROVIDED_PACKAGES } = require('./runtime-dependency-names.cjs');

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function collectPackageJsonPaths(directory) {
  const results = [];
  const entries = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.name.startsWith('@')) {
      results.push(...collectPackageJsonPaths(entryPath));
      continue;
    }
    const packageJsonPath = path.join(entryPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      results.push(packageJsonPath);
    }
    const nestedNodeModules = path.join(entryPath, 'node_modules');
    if (fs.existsSync(nestedNodeModules)) {
      results.push(...collectPackageJsonPaths(nestedNodeModules));
    }
  }
  return results;
}

export function resolvePackageJsonFrom(fromDir, packageName, rootNodeModulesDir) {
  const parts = packageName.startsWith('@') ? packageName.split('/') : [packageName];
  let current = fromDir;
  while (current.startsWith(path.dirname(rootNodeModulesDir))) {
    const candidate = path.join(current, 'node_modules', ...parts, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const rootCandidate = path.join(rootNodeModulesDir, ...parts, 'package.json');
  return fs.existsSync(rootCandidate) ? rootCandidate : undefined;
}

/**
 * @returns {string[]} `"<dependent> -> <dependency>"` for every required dependency that
 * is not present in the packaged tree.
 */
export function findMissingRuntimeDependencies(rootNodeModulesDir) {
  const missing = [];
  for (const packageJsonPath of collectPackageJsonPaths(rootNodeModulesDir)) {
    const dependentDir = path.dirname(packageJsonPath);
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    for (const dependencyName of collectRequiredDependencyNames(pkg)) {
      if (HOST_PROVIDED_PACKAGES.has(dependencyName)) continue;
      if (!resolvePackageJsonFrom(dependentDir, dependencyName, rootNodeModulesDir)) {
        missing.push(`${pkg.name || dependentDir} -> ${dependencyName}`);
      }
    }
  }
  return missing;
}

export function verifyRuntimeDependencyClosure(rootNodeModulesDir) {
  const missing = findMissingRuntimeDependencies(rootNodeModulesDir);
  if (missing.length) {
    throw new Error(
      `Missing packaged runtime dependencies:\n${missing.map(item => `  - ${item}`).join('\n')}`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const rootNodeModulesDir = path.resolve(process.argv[2] ?? path.join(packageDir, 'out', 'node_modules'));
  if (!fs.existsSync(rootNodeModulesDir)) {
    console.error(`Packaged node_modules not found: ${rootNodeModulesDir}`);
    process.exit(1);
  }
  try {
    verifyRuntimeDependencyClosure(rootNodeModulesDir);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
  console.log('✅ Packaged runtime dependency closure is complete.');
}
