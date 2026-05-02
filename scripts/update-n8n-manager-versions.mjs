#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncDependencyManifests } from './sync-dependencies.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const MANAGER_FAMILY_PATTERN = /^@n8n-as-code\/n8n-manager(?:-.+)?$/;
const MANAGER_RELATED_PACKAGES = new Set(['@n8n-as-code/n8n-credentials-manager']);
const SEMVER_SPEC_PATTERN = /^(?<prefix>[~^]?)(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function readJsonFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    content,
    value: JSON.parse(content),
  };
}

function getJsonIndent(content) {
  const match = content.match(/^([ \t]+)"/m);
  return match ? match[1] : '  ';
}

function writeJsonFile(filePath, value, indent) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, indent)}\n`);
}

function getWorkspacePatterns(rootPackageJson) {
  if (Array.isArray(rootPackageJson.workspaces)) {
    return rootPackageJson.workspaces;
  }
  if (Array.isArray(rootPackageJson.workspaces?.packages)) {
    return rootPackageJson.workspaces.packages;
  }
  return [];
}

function expandWorkspacePattern(rootDir, pattern) {
  if (!pattern.endsWith('/*')) {
    const packageJsonPath = path.join(rootDir, pattern, 'package.json');
    return fs.existsSync(packageJsonPath) ? [path.dirname(packageJsonPath)] : [];
  }

  const parent = path.join(rootDir, pattern.slice(0, -2));
  if (!fs.existsSync(parent)) {
    return [];
  }

  return fs.readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(parent, entry.name))
    .filter(dir => fs.existsSync(path.join(dir, 'package.json')));
}

function collectManifests(rootDir = workspaceRoot) {
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackageJson = readJsonFile(rootPackageJsonPath).value;
  const workspaceDirs = getWorkspacePatterns(rootPackageJson)
    .flatMap(pattern => expandWorkspacePattern(rootDir, pattern));

  return [rootPackageJsonPath, ...workspaceDirs.map(dir => path.join(dir, 'package.json'))]
    .map(filePath => {
      const { content, value } = readJsonFile(filePath);
      return {
        filePath,
        relativePath: normalizePath(path.relative(rootDir, filePath)),
        content,
        indent: getJsonIndent(content),
        json: value,
      };
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function isManagerDependency(dependencyName) {
  return MANAGER_FAMILY_PATTERN.test(dependencyName) || MANAGER_RELATED_PACKAGES.has(dependencyName);
}

function getLatestPublishedVersion(packageName) {
  return execFileSync('npm', ['view', packageName, 'version'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getSpecPrefix(spec) {
  const match = SEMVER_SPEC_PATTERN.exec(spec);
  if (!match?.groups) {
    throw new Error(`Unsupported ${spec} version spec. Expected an exact, ^, or ~ semver range.`);
  }
  return match.groups.prefix || '';
}

function updateManagerDependencySpecs(manifests) {
  const packageNames = new Set();
  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const dependencyName of Object.keys(manifest.json[section] || {})) {
        if (isManagerDependency(dependencyName)) {
          packageNames.add(dependencyName);
        }
      }
    }
  }

  const sortedPackageNames = [...packageNames].sort();
  const latestVersions = new Map(sortedPackageNames.map(name => [name, getLatestPublishedVersion(name)]));
  const changes = [];

  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = manifest.json[section];
      if (!dependencies) {
        continue;
      }

      for (const [dependencyName, currentSpec] of Object.entries(dependencies)) {
        if (!latestVersions.has(dependencyName)) {
          continue;
        }

        const nextSpec = `${getSpecPrefix(currentSpec)}${latestVersions.get(dependencyName)}`;
        if (currentSpec === nextSpec) {
          continue;
        }

        dependencies[dependencyName] = nextSpec;
        changes.push({
          file: manifest.relativePath,
          section,
          dependency: dependencyName,
          from: currentSpec,
          to: nextSpec,
        });
      }
    }
  }

  const changedFiles = [];
  for (const manifest of manifests) {
    const nextContent = `${JSON.stringify(manifest.json, null, manifest.indent)}\n`;
    if (nextContent === manifest.content) {
      continue;
    }
    writeJsonFile(manifest.filePath, manifest.json, manifest.indent);
    changedFiles.push(manifest.relativePath);
  }

  return { changes, changedFiles, packageNames: sortedPackageNames };
}

function installWorkspaceDependencies() {
  execFileSync('npm', ['install'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
}

function runCli() {
  const manifests = collectManifests();
  const result = updateManagerDependencySpecs(manifests);

  if (result.packageNames.length === 0) {
    console.log('No n8n-manager dependencies found in workspace manifests.');
    return;
  }

  if (result.changes.length === 0) {
    console.log('n8n-manager dependency specs are already at the latest published versions.');
    return;
  }

  console.log('Updated n8n-manager dependency specs:');
  for (const change of result.changes) {
    console.log(`  - ${change.file}: ${change.section}.${change.dependency} ${change.from} -> ${change.to}`);
  }

  const syncResult = syncDependencyManifests({ mode: 'write' });
  if (!syncResult.ok) {
    throw new Error(syncResult.errors.join('\n'));
  }

  console.log('Refreshing workspace installation...');
  installWorkspaceDependencies();
}

try {
  runCli();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
