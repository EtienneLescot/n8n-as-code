#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const INTERNAL_DEPENDENCY_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
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

function collectManifestFiles(rootDir = workspaceRoot) {
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const rootPackageJson = readJsonFile(rootPackageJsonPath).value;
  const workspaceDirs = getWorkspacePatterns(rootPackageJson)
    .flatMap(pattern => expandWorkspacePattern(rootDir, pattern));

  const manifestPaths = [rootPackageJsonPath, ...workspaceDirs.map(dir => path.join(dir, 'package.json'))];
  return [...new Set(manifestPaths)]
    .sort((left, right) => normalizePath(path.relative(rootDir, left)).localeCompare(normalizePath(path.relative(rootDir, right))));
}

function collectManifests(rootDir = workspaceRoot) {
  return collectManifestFiles(rootDir).map(filePath => {
    const { content, value } = readJsonFile(filePath);
    const relativePath = normalizePath(path.relative(rootDir, filePath));
    return {
      filePath,
      relativePath,
      content,
      indent: getJsonIndent(content),
      json: value,
      isRoot: relativePath === 'package.json',
    };
  });
}

function buildWorkspacePackageMap(manifests) {
  const packages = new Map();
  for (const manifest of manifests) {
    if (manifest.isRoot || !manifest.json.name || !manifest.json.version) {
      continue;
    }
    packages.set(manifest.json.name, manifest);
  }
  return packages;
}

function isManagerFamilyDependency(dependencyName) {
  return MANAGER_FAMILY_PATTERN.test(dependencyName) || MANAGER_RELATED_PACKAGES.has(dependencyName);
}

function parseSemverSpec(spec) {
  const match = SEMVER_SPEC_PATTERN.exec(spec);
  if (!match?.groups) {
    return null;
  }
  return {
    spec,
    prefix: match.groups.prefix,
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
    prerelease: match.groups.prerelease || '',
    build: match.groups.build || '',
  };
}

function comparePrereleaseIdentifier(left, right) {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return Number(left) - Number(right);
  }
  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }
  return left.localeCompare(right);
}

function comparePrerelease(left, right) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  const leftIdentifiers = left.split('.');
  const rightIdentifiers = right.split('.');
  const maxLength = Math.max(leftIdentifiers.length, rightIdentifiers.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }

    const result = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

function compareParsedSemver(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function getDependencyEntries(manifests) {
  const entries = [];
  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = manifest.json[section];
      if (!dependencies) {
        continue;
      }
      for (const [name, spec] of Object.entries(dependencies)) {
        entries.push({ manifest, section, name, spec });
      }
    }
  }
  return entries;
}

function syncInternalDependencies(manifests, workspacePackages) {
  const changes = [];
  for (const manifest of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = manifest.json[section];
      if (!dependencies) {
        continue;
      }
      for (const [name, spec] of Object.entries(dependencies)) {
        const workspacePackage = workspacePackages.get(name);
        if (!workspacePackage) {
          continue;
        }
        const expected = workspacePackage.json.version;
        if (spec === expected) {
          continue;
        }
        dependencies[name] = expected;
        changes.push({
          type: 'internal',
          file: manifest.relativePath,
          section,
          dependency: name,
          from: spec,
          to: expected,
        });
      }
    }
  }
  return changes;
}

function syncManagerFamilyDependencies(manifests) {
  const changes = [];
  const errors = [];
  const instancesByName = new Map();

  for (const entry of getDependencyEntries(manifests)) {
    if (!isManagerFamilyDependency(entry.name)) {
      continue;
    }
    const parsed = parseSemverSpec(entry.spec);
    if (!parsed) {
      errors.push(`${entry.manifest.relativePath}:${entry.section}.${entry.name} uses unsupported manager dependency spec "${entry.spec}"`);
      continue;
    }
    const instances = instancesByName.get(entry.name) || [];
    instances.push({ ...entry, parsed });
    instancesByName.set(entry.name, instances);
  }

  for (const [dependencyName, instances] of instancesByName) {
    if (instances.length < 2) {
      continue;
    }

    const canonical = instances.reduce((best, current) => {
      return compareParsedSemver(current.parsed, best.parsed) > 0 ? current : best;
    }, instances[0]);

    for (const instance of instances) {
      if (instance.spec === canonical.spec) {
        continue;
      }
      instance.manifest.json[instance.section][dependencyName] = canonical.spec;
      changes.push({
        type: 'n8n-manager',
        file: instance.manifest.relativePath,
        section: instance.section,
        dependency: dependencyName,
        from: instance.spec,
        to: canonical.spec,
      });
    }
  }

  return { changes, errors };
}

function getChangedManifestFiles(manifests) {
  return manifests
    .filter(manifest => `${JSON.stringify(manifest.json, null, manifest.indent)}\n` !== manifest.content)
    .map(manifest => manifest.relativePath);
}

function writeChangedManifests(manifests) {
  const changedFiles = [];
  for (const manifest of manifests) {
    const nextContent = `${JSON.stringify(manifest.json, null, manifest.indent)}\n`;
    if (nextContent === manifest.content) {
      continue;
    }
    writeJsonFile(manifest.filePath, manifest.json, manifest.indent);
    changedFiles.push(manifest.relativePath);
  }
  return changedFiles;
}

function gitLines(args, rootDir) {
  try {
    const output = execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return output ? output.split('\n').map(line => line.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function assertNoPreexistingUnstagedChanges(rootDir, relativeFiles) {
  if (relativeFiles.length === 0) {
    return;
  }

  const unstagedFiles = gitLines(['diff', '--name-only', '--', ...relativeFiles], rootDir);
  if (unstagedFiles.length === 0) {
    return;
  }

  throw new Error([
    'Dependency sync would need to stage package manifests that already have unstaged changes.',
    'Stage or stash these files first so the hook does not hide unrelated edits:',
    ...unstagedFiles.map(file => `  - ${file}`),
  ].join('\n'));
}

function stageFiles(rootDir, relativeFiles) {
  if (relativeFiles.length === 0) {
    return;
  }
  execFileSync('git', ['add', '--', ...relativeFiles], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

function getRuntimeInternalDependencies(packageJson, workspacePackageNames) {
  const dependencies = [];
  for (const section of INTERNAL_DEPENDENCY_SECTIONS) {
    for (const dependencyName of Object.keys(packageJson[section] || {})) {
      if (workspacePackageNames.has(dependencyName) && !dependencies.includes(dependencyName)) {
        dependencies.push(dependencyName);
      }
    }
  }
  return dependencies;
}

export function readWorkspacePackageGraph(rootDir = workspaceRoot) {
  const manifests = collectManifests(rootDir);
  const workspacePackages = buildWorkspacePackageMap(manifests);
  const workspacePackageNames = new Set(workspacePackages.keys());

  return [...workspacePackages.values()].map(manifest => ({
    name: manifest.json.name,
    version: manifest.json.version,
    path: normalizePath(path.dirname(manifest.relativePath)),
    packageJsonPath: manifest.relativePath,
    packageJson: manifest.json,
    internalDependencies: getRuntimeInternalDependencies(manifest.json, workspacePackageNames),
  }));
}

export function syncDependencyManifests(options = {}) {
  const rootDir = options.workspaceRoot || workspaceRoot;
  const mode = options.mode || 'check';
  const shouldWrite = mode === 'write';
  const shouldStage = Boolean(options.stage);
  const manifests = collectManifests(rootDir);
  const workspacePackages = buildWorkspacePackageMap(manifests);

  const changes = [
    ...syncInternalDependencies(manifests, workspacePackages),
  ];
  const managerResult = syncManagerFamilyDependencies(manifests);
  changes.push(...managerResult.changes);

  const changedFiles = getChangedManifestFiles(manifests);
  if (managerResult.errors.length > 0) {
    return { ok: false, mode, changes, changedFiles, errors: managerResult.errors };
  }

  if (shouldWrite && changedFiles.length > 0) {
    if (shouldStage) {
      assertNoPreexistingUnstagedChanges(rootDir, changedFiles);
    }
    const writtenFiles = writeChangedManifests(manifests);
    if (shouldStage) {
      stageFiles(rootDir, writtenFiles);
    }
    return { ok: true, mode, changes, changedFiles: writtenFiles, errors: [] };
  }

  return {
    ok: shouldWrite || changes.length === 0,
    mode,
    changes,
    changedFiles,
    errors: [],
  };
}

function parseArgs(argv) {
  const options = { mode: 'check', stage: false };
  for (const arg of argv) {
    if (arg === '--write') {
      options.mode = 'write';
    } else if (arg === '--check') {
      options.mode = 'check';
    } else if (arg === '--stage') {
      options.stage = true;
    } else if (arg === '--silent') {
      options.silent = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function formatChange(change) {
  return `${change.file}: ${change.section}.${change.dependency} ${change.from} -> ${change.to}`;
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = syncDependencyManifests(options);

  if (!options.silent) {
    if (result.errors.length > 0) {
      console.error('Dependency sync failed:');
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
    }

    if (result.changes.length > 0) {
      const verb = options.mode === 'write' ? 'Updated' : 'Would update';
      console.log(`${verb} dependency specs:`);
      for (const change of result.changes) {
        console.log(`  - ${formatChange(change)}`);
      }
    } else if (result.errors.length === 0) {
      console.log('Dependency specs are up to date.');
    }

    if (options.mode === 'write' && result.changedFiles.length > 0) {
      console.log('Changed manifests:');
      for (const file of result.changedFiles) {
        console.log(`  - ${file}`);
      }
    }
  }

  if (!result.ok) {
    process.exitCode = 1;
  }

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
