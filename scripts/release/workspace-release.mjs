#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PACKAGES = [
  {
    name: '@n8n-as-code/transformer',
    path: 'packages/transformer',
    packageJsonPath: 'packages/transformer/package.json',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/transformer@',
    internalDependencies: [],
  },
  {
    name: '@n8n-as-code/skills',
    path: 'packages/skills',
    packageJsonPath: 'packages/skills/package.json',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/skills@',
    internalDependencies: ['@n8n-as-code/transformer'],
  },
  {
    name: 'n8nac',
    path: 'packages/cli',
    packageJsonPath: 'packages/cli/package.json',
    publishTarget: 'npm',
    tagPrefix: 'n8nac@',
    internalDependencies: ['@n8n-as-code/skills', '@n8n-as-code/transformer'],
  },
  {
    name: 'n8n-as-code',
    path: 'packages/vscode-extension',
    packageJsonPath: 'packages/vscode-extension/package.json',
    publishTarget: 'vscode',
    tagPrefix: 'n8n-as-code@',
    internalDependencies: ['@n8n-as-code/skills', 'n8nac'],
  },
];

const PATCH_TYPES = new Set(['fix', 'perf', 'refactor', 'revert', 'deps', 'build']);
const BUMP_PRIORITY = { none: 0, patch: 1, minor: 2, major: 3 };
const extensionPackage = PACKAGES.find(pkg => pkg.name === 'n8n-as-code');

function git(args) {
  return execFileSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitLines(args) {
  const output = git(args);
  return output ? output.split('\n').map(line => line.trim()).filter(Boolean) : [];
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function parseVersion(rawVersion) {
  const stable = String(rawVersion).replace(/-.*$/, '');
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(stable);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function incrementVersion(version, bump) {
  const nextVersion = { ...version };
  if (bump === 'major') {
    nextVersion.major += 1;
    nextVersion.minor = 0;
    nextVersion.patch = 0;
    return nextVersion;
  }
  if (bump === 'minor') {
    nextVersion.minor += 1;
    nextVersion.patch = 0;
    return nextVersion;
  }
  if (bump === 'patch') {
    nextVersion.patch += 1;
    return nextVersion;
  }
  return nextVersion;
}

function maxBump(left, right) {
  const leftPriority = BUMP_PRIORITY[left || 'none'];
  const rightPriority = BUMP_PRIORITY[right || 'none'];
  return rightPriority > leftPriority ? right : left;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(path.join(workspaceRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function parseTagVersion(tag, prefix) {
  if (!tag.startsWith(prefix)) {
    return null;
  }
  return parseVersion(tag.slice(prefix.length).replace(/^v/, ''));
}

function getLatestStableTag(pkg) {
  const tags = gitLines(['tag', '--list', `${pkg.tagPrefix}*`]);
  let latest = null;

  for (const tag of tags) {
    const version = parseTagVersion(tag, pkg.tagPrefix);
    if (!version) {
      continue;
    }

    if (!latest || compareVersions(version, latest.version) > 0) {
      latest = { tag, version };
    }
  }

  return latest;
}

const commitCache = new Map();

function getCommitDetails(sha) {
  if (commitCache.has(sha)) {
    return commitCache.get(sha);
  }

  const message = git(['show', '-s', '--format=%B', sha]);
  const files = gitLines(['show', '--format=', '--name-only', '--no-renames', sha]);
  const details = { sha, message, files };
  commitCache.set(sha, details);
  return details;
}

function getAffectedPackageNames(files) {
  const affected = new Set();

  for (const file of files) {
    for (const pkg of PACKAGES) {
      if (file === pkg.packageJsonPath || file.startsWith(`${pkg.path}/`)) {
        affected.add(pkg.name);
      }
    }

    if (file.startsWith('res/')) {
      affected.add('n8n-as-code');
    }
  }

  return affected;
}

function parseCommitBump(message) {
  const normalized = message.trim();
  if (!normalized) {
    return null;
  }

  if (/^BREAKING CHANGE:/m.test(normalized) || /^BREAKING-CHANGE:/m.test(normalized)) {
    return 'major';
  }

  const subject = normalized.split('\n')[0].trim();
  const match = /^([a-z]+)(\([^)]*\))?(!)?:\s/.exec(subject);
  if (!match) {
    return null;
  }

  if (match[3]) {
    return 'major';
  }

  const type = match[1];
  if (type === 'feat') {
    return 'minor';
  }
  if (PATCH_TYPES.has(type)) {
    return 'patch';
  }

  return null;
}

function getCommitsSinceTag(tag) {
  return gitLines(['log', '--format=%H', `${tag}..HEAD`]);
}

function buildDirectBumps() {
  const bumps = new Map();

  for (const pkg of PACKAGES) {
    const latestTag = getLatestStableTag(pkg);
    const directBump = { bump: null, commits: [] };

    if (!latestTag) {
      bumps.set(pkg.name, directBump);
      continue;
    }

    const commits = getCommitsSinceTag(latestTag.tag);
    for (const sha of commits) {
      const details = getCommitDetails(sha);
      const commitBump = parseCommitBump(details.message);
      if (!commitBump) {
        continue;
      }

      const affectedPackages = getAffectedPackageNames(details.files);
      if (!affectedPackages.has(pkg.name)) {
        continue;
      }

      directBump.bump = maxBump(directBump.bump, commitBump);
      directBump.commits.push({ sha, subject: details.message.trim().split('\n')[0], bump: commitBump });
    }

    bumps.set(pkg.name, directBump);
  }

  return bumps;
}

function propagateDependencyBumps(directBumps) {
  const resolved = new Map();

  for (const pkg of PACKAGES) {
    const direct = directBumps.get(pkg.name) || { bump: null, commits: [] };
    resolved.set(pkg.name, {
      bump: direct.bump,
      commits: [...direct.commits],
      reasons: direct.bump ? ['direct'] : [],
    });
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const pkg of PACKAGES) {
      const current = resolved.get(pkg.name);
      for (const dependencyName of pkg.internalDependencies) {
        const dependency = resolved.get(dependencyName);
        if (!dependency?.bump) {
          continue;
        }

        const nextBump = maxBump(current.bump, 'patch');
        if (nextBump !== current.bump) {
          current.bump = nextBump;
          if (!current.reasons.includes(`dependency:${dependencyName}`)) {
            current.reasons.push(`dependency:${dependencyName}`);
          }
          changed = true;
        }
      }
    }
  }

  return resolved;
}

function computeStablePlan() {
  const directBumps = buildDirectBumps();
  const resolvedBumps = propagateDependencyBumps(directBumps);

  const packages = PACKAGES.map(pkg => {
    const packageJson = readJson(pkg.packageJsonPath);
    const currentVersion = packageJson.version;
    const currentStableVersion = parseVersion(currentVersion);
    if (!currentStableVersion) {
      throw new Error(`Unsupported version in ${pkg.packageJsonPath}: ${currentVersion}`);
    }

    const latestTag = getLatestStableTag(pkg);
    const bumpInfo = resolvedBumps.get(pkg.name) || { bump: null, commits: [], reasons: [] };
    const directInfo = directBumps.get(pkg.name) || { bump: null, commits: [] };
    const targetVersion = bumpInfo.bump ? formatVersion(incrementVersion(currentStableVersion, bumpInfo.bump)) : currentVersion.replace(/-.*$/, '');

    return {
      ...pkg,
      currentVersion,
      latestStableTag: latestTag?.tag ?? null,
      latestStableVersion: latestTag ? formatVersion(latestTag.version) : null,
      bump: bumpInfo.bump,
      directBump: directInfo.bump,
      changed: Boolean(bumpInfo.bump),
      targetVersion,
      commits: directInfo.commits,
      reasons: bumpInfo.reasons,
    };
  });

  return {
    mode: 'stable',
    changed: packages.some(pkg => pkg.changed),
    packages,
  };
}

function getPrereleaseSequence() {
  const latestTag = getLatestStableTag(extensionPackage);
  if (!latestTag) {
    return 1;
  }

  const count = Number(git(['rev-list', '--count', `${latestTag.tag}..HEAD`]) || '0');
  return Math.max(1, count);
}

function computePrereleasePlan() {
  const stablePlan = computeStablePlan();
  const sequence = getPrereleaseSequence();
  const packages = stablePlan.packages.map(pkg => {
    if (!pkg.changed) {
      return {
        ...pkg,
        prereleaseVersion: null,
      };
    }

    return {
      ...pkg,
      prereleaseVersion: `${pkg.targetVersion}-next.${sequence}`,
    };
  });

  return {
    mode: 'prerelease',
    changed: packages.some(pkg => pkg.changed),
    sequence,
    packages,
  };
}

function computePendingStablePlan() {
  const packages = PACKAGES.map(pkg => {
    const packageJson = readJson(pkg.packageJsonPath);
    const currentVersion = packageJson.version;
    const currentStableVersion = parseVersion(currentVersion);
    if (!currentStableVersion) {
      throw new Error(`Unsupported version in ${pkg.packageJsonPath}: ${currentVersion}`);
    }

    const latestTag = getLatestStableTag(pkg);
    const latestStableVersion = latestTag ? formatVersion(latestTag.version) : null;
    const changed = latestTag ? compareVersions(currentStableVersion, latestTag.version) > 0 : false;

    return {
      ...pkg,
      currentVersion,
      latestStableTag: latestTag?.tag ?? null,
      latestStableVersion,
      targetVersion: formatVersion(currentStableVersion),
      changed,
    };
  });

  return {
    mode: 'pending-stable',
    changed: packages.some(pkg => pkg.changed),
    packages,
  };
}

function applyPlan(plan, versionKey) {
  const changedVersions = new Map();
  for (const pkg of plan.packages) {
    const version = pkg[versionKey];
    if (pkg.changed && version) {
      changedVersions.set(pkg.name, version);
    }
  }

  if (changedVersions.size === 0) {
    return plan;
  }

  for (const pkg of PACKAGES) {
    const packageJson = readJson(pkg.packageJsonPath);
    const nextVersion = changedVersions.get(pkg.name);
    if (nextVersion) {
      packageJson.version = nextVersion;
    }

    if (packageJson.dependencies) {
      for (const [dependencyName, dependencyVersion] of Object.entries(packageJson.dependencies)) {
        const nextDependencyVersion = changedVersions.get(dependencyName);
        if (!nextDependencyVersion) {
          continue;
        }
        if (dependencyVersion !== nextDependencyVersion) {
          packageJson.dependencies[dependencyName] = nextDependencyVersion;
        }
      }
    }

    writeJson(pkg.packageJsonPath, packageJson);
  }

  return plan;
}

function main() {
  const args = parseArgs(process.argv);
  const command = args._[0];
  const apply = Boolean(args.apply);
  let plan;

  if (command === 'stable-pr') {
    plan = computeStablePlan();
    if (apply) {
      applyPlan(plan, 'targetVersion');
    }
  } else if (command === 'prerelease') {
    plan = computePrereleasePlan();
    if (apply) {
      applyPlan(plan, 'prereleaseVersion');
    }
  } else if (command === 'pending-stable') {
    plan = computePendingStablePlan();
  } else {
    console.error('Usage: node scripts/release/workspace-release.mjs <stable-pr|prerelease|pending-stable> [--apply]');
    process.exit(1);
  }

  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

main();