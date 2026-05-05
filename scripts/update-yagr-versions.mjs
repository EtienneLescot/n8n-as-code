#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { syncDependencyManifests } from './sync-dependencies.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const YAGR_PACKAGE_PATTERN = /^@yagr\//;
const SEMVER_SPEC_PATTERN = /^(?<prefix>[~^]?)(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;
const DEFAULT_RANGE_PREFIX = '^';

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

function collectLockfileYagrPackages(rootDir = workspaceRoot) {
  const lockfilePath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    return [];
  }

  const lockfile = readJsonFile(lockfilePath).value;
  const packageNames = new Set();
  const packages = lockfile.packages || {};

  for (const [packagePath, entry] of Object.entries(packages)) {
    const nodeModulesPrefix = 'node_modules/';
    if (packagePath.startsWith(`${nodeModulesPrefix}@yagr/`)) {
      const packageName = packagePath.slice(nodeModulesPrefix.length);
      if (isYagrDependency(packageName) && !packageName.includes('/node_modules/')) {
        packageNames.add(packageName);
      }
    }

    for (const dependencyName of Object.keys(entry?.dependencies || {})) {
      if (isYagrDependency(dependencyName)) {
        packageNames.add(dependencyName);
      }
    }
  }

  return [...packageNames].sort();
}

function isYagrDependency(dependencyName) {
  return YAGR_PACKAGE_PATTERN.test(dependencyName);
}

function getLatestPublishedVersion(packageName) {
  return execFileSync('npm', ['view', `${packageName}@latest`, 'version'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getSpecPrefix(spec) {
  const match = SEMVER_SPEC_PATTERN.exec(spec);
  return match?.groups?.prefix || DEFAULT_RANGE_PREFIX;
}

function updateYagrDependencySpecs(manifests) {
  const manifestPackageNames = new Set();
  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      for (const dependencyName of Object.keys(manifest.json[section] || {})) {
        if (isYagrDependency(dependencyName)) {
          manifestPackageNames.add(dependencyName);
        }
      }
    }
  }

  const lockfilePackageNames = collectLockfileYagrPackages();
  const sortedPackageNames = [...new Set([...manifestPackageNames, ...lockfilePackageNames])].sort();
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

  return {
    changes,
    changedFiles,
    packageNames: sortedPackageNames,
    manifestPackageNames: [...manifestPackageNames].sort(),
    lockfilePackageNames,
  };
}

function installWorkspaceDependencies(packageNames) {
  execFileSync('npm', ['install'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  if (packageNames.length === 0) {
    return;
  }

  execFileSync('npm', ['update', '--save=false', ...packageNames], {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });
}

function runCli() {
  const manifests = collectManifests();
  const result = updateYagrDependencySpecs(manifests);

  if (result.packageNames.length === 0) {
    console.log('No Yagr dependencies found in workspace manifests or lockfile.');
    return;
  }

  if (result.changes.length > 0) {
    console.log('Updated Yagr dependency specs:');
    for (const change of result.changes) {
      console.log(`  - ${change.file}: ${change.section}.${change.dependency} ${change.from} -> ${change.to}`);
    }
  } else {
    console.log('Yagr dependency specs are already at the latest published versions.');
  }

  console.log('Refreshing Yagr package installation:');
  for (const packageName of result.packageNames) {
    const source = result.manifestPackageNames.includes(packageName) ? 'manifest' : 'lockfile';
    console.log(`  - ${packageName} (${source})`);
  }

  const syncResult = syncDependencyManifests({ mode: 'write' });
  if (!syncResult.ok) {
    throw new Error(syncResult.errors.join('\n'));
  }

  console.log('Refreshing workspace installation...');
  installWorkspaceDependencies(result.packageNames);
}

try {
  runCli();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
