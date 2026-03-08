#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPackageJsonPath = path.join(workspaceRoot, 'packages', 'vscode-extension', 'package.json');
const extensionId = 'etienne-lescot.n8n-as-code';
const defaultConfigFile = 'release-please-config.json';
const defaultManifestFile = '.release-please-manifest.json';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function readBaseVersion() {
  const packageJson = JSON.parse(fs.readFileSync(extensionPackageJsonPath, 'utf8'));
  const version = packageJson.version.replace(/-next.*$/, '');
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error(`Unsupported extension version in package.json: ${packageJson.version}`);
  }
  return parsed;
}

function extractVersionFromReleasePleaseOutput(output) {
  const titleLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('title:'));

  if (!titleLine) {
    return null;
  }

  const matches = titleLine.match(/\b\d+\.\d+\.\d+\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  return parseVersion(matches[matches.length - 1]);
}

function predictVersionWithReleasePlease({ repoUrl, targetBranch, token, configFile, manifestFile }) {
  if (!repoUrl || !targetBranch || !token) {
    return null;
  }

  const args = [
    '--yes',
    'release-please',
    'release-pr',
    '--dry-run',
    '--token',
    token,
    '--target-branch',
    targetBranch,
    '--repo-url',
    repoUrl,
    '--config-file',
    configFile,
    '--manifest-file',
    manifestFile,
  ];

  try {
    const output = execFileSync('npx', args, {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return extractVersionFromReleasePleaseOutput(output);
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    const parsed = extractVersionFromReleasePleaseOutput(output);
    if (parsed) {
      return parsed;
    }
    console.error('release-please dry-run did not return a parseable version for packages/vscode-extension.');
    console.error(output.trim());
    return null;
  }
}

async function fetchMarketplaceVersions() {
  const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filters: [
        {
          criteria: [
            {
              filterType: 7,
              value: extensionId,
            },
          ],
        },
      ],
      flags: 529,
    }),
  });

  if (!response.ok) {
    throw new Error(`Marketplace query failed with status ${response.status}`);
  }

  const payload = await response.json();
  const versions = payload?.results?.[0]?.extensions?.[0]?.versions ?? [];
  return versions
    .map(entry => entry.version)
    .filter(version => parseVersion(version));
}

function resolveNextFreeVersion(predictedVersion, publishedVersions) {
  const sameLineVersions = publishedVersions
    .map(parseVersion)
    .filter(version => version && version.major === predictedVersion.major && version.minor === predictedVersion.minor);

  const highestPatch = sameLineVersions.length > 0
    ? Math.max(...sameLineVersions.map(version => version.patch))
    : predictedVersion.patch - 1;

  return {
    major: predictedVersion.major,
    minor: predictedVersion.minor,
    patch: Math.max(predictedVersion.patch, highestPatch + 1),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.mode || 'stable';
  const repoUrl = args['repo-url'] || process.env.GITHUB_REPOSITORY;
  const targetBranch = args['target-branch'] || process.env.GITHUB_REF_NAME;
  const token = args.token || process.env.GITHUB_TOKEN;
  const configFile = args['config-file'] || defaultConfigFile;
  const manifestFile = args['manifest-file'] || defaultManifestFile;

  const baseVersion = readBaseVersion();
  const predictedVersion = mode === 'preview' || mode === 'release-as'
    ? (predictVersionWithReleasePlease({ repoUrl, targetBranch, token, configFile, manifestFile }) || baseVersion)
    : baseVersion;

  const publishedVersions = await fetchMarketplaceVersions();
  const resolvedVersion = resolveNextFreeVersion(predictedVersion, publishedVersions);

  console.error(`Mode: ${mode}`);
  console.error(`Predicted version line: ${formatVersion(predictedVersion)}`);
  console.error(`Resolved publish version: ${formatVersion(resolvedVersion)}`);
  process.stdout.write(`${formatVersion(resolvedVersion)}\n`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});