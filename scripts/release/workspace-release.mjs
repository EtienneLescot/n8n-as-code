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
    changelogPath: 'packages/transformer/CHANGELOG.md',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/transformer@',
    internalDependencies: [],
  },
  {
    name: '@n8n-as-code/skills',
    path: 'packages/skills',
    packageJsonPath: 'packages/skills/package.json',
    changelogPath: 'packages/skills/CHANGELOG.md',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/skills@',
    internalDependencies: ['@n8n-as-code/transformer'],
  },
  {
    name: 'n8nac',
    path: 'packages/cli',
    packageJsonPath: 'packages/cli/package.json',
    changelogPath: 'packages/cli/CHANGELOG.md',
    publishTarget: 'npm',
    tagPrefix: 'n8nac@',
    internalDependencies: ['@n8n-as-code/skills', '@n8n-as-code/transformer'],
  },
  {
    name: '@n8n-as-code/mcp',
    path: 'packages/mcp',
    packageJsonPath: 'packages/mcp/package.json',
    changelogPath: 'packages/mcp/CHANGELOG.md',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/mcp@',
    internalDependencies: [],
  },
  {
    name: 'n8n-as-code',
    path: 'packages/vscode-extension',
    packageJsonPath: 'packages/vscode-extension/package.json',
    changelogPath: 'packages/vscode-extension/CHANGELOG.md',
    publishTarget: 'vscode',
    tagPrefix: 'n8n-as-code@',
    internalDependencies: ['@n8n-as-code/skills', 'n8nac'],
  },
  {
    name: '@n8n-as-code/n8nac',
    path: 'plugins/openclaw/n8n-as-code',
    packageJsonPath: 'plugins/openclaw/n8n-as-code/package.json',
    changelogPath: 'plugins/openclaw/n8n-as-code/CHANGELOG.md',
    publishTarget: 'npm',
    tagPrefix: '@n8n-as-code/n8nac@',
    internalDependencies: [],
  },
];

const PATCH_TYPES = new Set(['fix', 'perf', 'refactor', 'revert', 'deps', 'build', 'docs']);
const BUMP_PRIORITY = { none: 0, patch: 1, minor: 2, major: 3 };
const extensionPackage = PACKAGES.find(pkg => pkg.name === 'n8n-as-code');

const CROSS_PACKAGE_RULES = [
  {
    matches(file) {
      return file.startsWith('res/') || file === 'scripts/sync-brand-assets.mjs' || file === 'scripts/build-and-install.js' || file === 'scripts/setup-dev-link.js';
    },
    packages: ['n8n-as-code'],
  },
  {
    matches(file) {
      return file === '.claude-plugin/marketplace.json' || file.startsWith('plugins/claude/') || file === 'CLAUDE_PLUGIN_SUBMISSION_DRAFT.md';
    },
    packages: ['@n8n-as-code/skills'],
  },
  {
    matches(file) {
      return file === 'scripts/ensure-n8n-cache.cjs'
        || file === 'scripts/stamp-n8n-version.cjs'
        || file === 'scripts/generate-n8n-index.cjs'
        || file === 'scripts/download-complete-docs.cjs'
        || file === 'scripts/build-complete-index.cjs'
        || file === 'scripts/enrich-nodes-technical.cjs'
        || file === 'scripts/build-knowledge-index.cjs'
        || file === 'scripts/build-workflow-index.cjs'
        || file === 'scripts/compare-extraction.mjs';
    },
    packages: ['@n8n-as-code/skills'],
  },
  {
    matches(file) {
      return file.startsWith('packages/cli/src/core/assets/') || file === 'scripts/test-ci-local.js';
    },
    packages: ['n8nac'],
  },
  {
    matches(file) {
      return file.startsWith('docs/docs/usage/claude-skill') || file.startsWith('docs/docs/contribution/claude-skill');
    },
    packages: ['@n8n-as-code/skills'],
  },
];

const CHANGELOG_SECTION_TITLES = new Map([
  ['major', '### ⚠ BREAKING CHANGES'],
  ['minor', '### Features'],
  ['patch', '### Bug Fixes'],
  ['docs', '### Documentation'],
]);

const COMMIT_SECTION_BY_TYPE = new Map([
  ['feat', 'minor'],
  ['fix', 'patch'],
  ['perf', 'patch'],
  ['refactor', 'patch'],
  ['revert', 'patch'],
  ['deps', 'patch'],
  ['build', 'patch'],
  ['docs', 'docs'],
]);

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

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
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

function getJsonIndent(content) {
  const match = content.match(/^([ \t]+)"/m);
  return match ? match[1] : '  ';
}

function writeJson(relativePath, value) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  const existingContent = fs.readFileSync(absolutePath, 'utf8');
  const existingValue = JSON.parse(existingContent);

  if (JSON.stringify(existingValue) === JSON.stringify(value)) {
    return;
  }

  const indent = getJsonIndent(existingContent);
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, indent)}\n`);
}

function getNextEvenMinor(minor) {
  return minor % 2 === 0 ? minor + 2 : minor + 1;
}

function getNextOddMinor(minor) {
  return minor % 2 === 0 ? minor + 1 : minor + 2;
}

function buildNextVscodeStableVersion(version, bump) {
  if (bump === 'major') {
    return {
      major: version.major + 1,
      minor: 0,
      patch: 0,
    };
  }

  return {
    major: version.major,
    minor: getNextEvenMinor(version.minor),
    patch: 0,
  };
}

function buildVscodePrereleaseVersion(stableVersion, sequence) {
  return formatVersion({
    major: stableVersion.major,
    minor: getNextOddMinor(stableVersion.minor),
    patch: Math.max(1, sequence),
  });
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
  const subject = git(['show', '-s', '--format=%s', sha]);
  const files = gitLines(['show', '--format=', '--name-only', '--no-renames', sha]);
  const details = {
    sha,
    message,
    subject,
    files,
    conventional: parseConventionalCommit(message),
  };
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

    for (const rule of CROSS_PACKAGE_RULES) {
      if (rule.matches(file)) {
        for (const pkgName of rule.packages) {
          affected.add(pkgName);
        }
      }
    }
  }

  return affected;
}

function parseConventionalCommit(message) {
  const normalized = message.trim();
  const subject = normalized.split('\n')[0]?.trim() || '';
  const match = /^([a-z]+)(\(([^)]*)\))?(!)?:\s(.+)$/.exec(subject);
  const body = normalized.split('\n').slice(1).join('\n').trim();
  const breaking = Boolean(match?.[4]) || /^BREAKING CHANGE:/m.test(normalized) || /^BREAKING-CHANGE:/m.test(normalized);

  return {
    raw: normalized,
    subject,
    body,
    type: match?.[1] || null,
    scope: match?.[3] || null,
    description: match?.[5] || subject,
    breaking,
  };
}

function parseCommitBump(message) {
  const conventional = parseConventionalCommit(message);
  if (!conventional.raw) {
    return null;
  }

  if (conventional.breaking) {
    return 'major';
  }

  if (!conventional.type) {
    return null;
  }

  if (conventional.type === 'feat') {
    return 'minor';
  }
  if (PATCH_TYPES.has(conventional.type)) {
    return 'patch';
  }

  return null;
}

let repositoryBaseUrlCache = null;

function normalizeGitHubRepositoryUrl(remoteUrl) {
  let repoPath = remoteUrl.trim();

  if (repoPath.startsWith('git@github.com:')) {
    repoPath = repoPath.replace(/^git@github\.com:/, '');
  } else if (repoPath.startsWith('https://github.com/')) {
    repoPath = repoPath.replace(/^https:\/\/github\.com\//, '');
  } else if (repoPath.startsWith('http://github.com/')) {
    repoPath = repoPath.replace(/^http:\/\/github\.com\//, '');
  }

  if (repoPath.endsWith('.git')) {
    repoPath = repoPath.slice(0, -4);
  }

  if (!repoPath || repoPath.includes('://')) {
    return null;
  }

  return `https://github.com/${repoPath}`;
}

function getRepositoryBaseUrl() {
  if (repositoryBaseUrlCache) {
    return repositoryBaseUrlCache;
  }

  const envRepository = process.env.GITHUB_REPOSITORY;
  if (envRepository) {
    repositoryBaseUrlCache = `https://github.com/${envRepository}`;
    return repositoryBaseUrlCache;
  }

  try {
    const remoteUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    repositoryBaseUrlCache = normalizeGitHubRepositoryUrl(remoteUrl) || 'https://github.com/EtienneLescot/n8n-as-code';
    return repositoryBaseUrlCache;
  } catch {
    repositoryBaseUrlCache = 'https://github.com/EtienneLescot/n8n-as-code';
    return repositoryBaseUrlCache;
  }
}

function getCommitUrl(sha) {
  return `${getRepositoryBaseUrl()}/commit/${sha}`;
}

function formatCommitBullet(commit) {
  const details = getCommitDetails(commit.sha);
  const conventional = details.conventional;
  const scope = conventional.scope ? `**${conventional.scope}:** ` : '';
  return `* ${scope}${conventional.description} ([${commit.sha.slice(0, 7)}](${getCommitUrl(commit.sha)}))`;
}

function groupCommitsForChangelog(commits) {
  const grouped = {
    major: [],
    minor: [],
    patch: [],
    docs: [],
  };

  for (const commit of commits) {
    const details = getCommitDetails(commit.sha);
    const conventional = details.conventional;
    if (conventional.breaking) {
      grouped.major.push(commit);
      continue;
    }

    const section = COMMIT_SECTION_BY_TYPE.get(conventional.type || '') || null;
    if (section) {
      grouped[section].push(commit);
    }
  }

  return grouped;
}

function buildDependencyChangelogSection(pkg, plan) {
  const dependencyLines = [];

  for (const dependencyName of pkg.internalDependencies) {
    const dependencyPlan = plan.packages.find(item => item.name === dependencyName);
    if (!dependencyPlan?.changed) {
      continue;
    }

    dependencyLines.push(`    * ${dependencyName} bumped from ${dependencyPlan.currentVersion} to ${dependencyPlan.targetVersion}`);
  }

  if (dependencyLines.length === 0) {
    return '';
  }

  return ['### Dependencies', '', '* The following workspace dependencies were updated', ...dependencyLines, ''].join('\n');
}

function buildChangelogEntry(pkg, pkgPlan, plan) {
  const previousTag = pkgPlan.latestStableTag || `${pkg.tagPrefix}v${pkgPlan.currentVersion}`;
  const title = `## [${pkgPlan.targetVersion}](${getRepositoryBaseUrl()}/compare/${previousTag}...${pkg.tagPrefix}v${pkgPlan.targetVersion}) (${getTodayDate()})`;
  const grouped = groupCommitsForChangelog(pkgPlan.commits);
  const sections = [title, ''];

  for (const [groupKey, heading] of CHANGELOG_SECTION_TITLES.entries()) {
    if (grouped[groupKey].length === 0) {
      continue;
    }

    sections.push(heading, '');
    for (const commit of grouped[groupKey]) {
      sections.push(formatCommitBullet(commit));
    }
    sections.push('');
  }

  const dependencySection = buildDependencyChangelogSection(pkg, plan);
  if (dependencySection) {
    sections.push(dependencySection);
  }

  return `${sections.join('\n').trimEnd()}\n\n`;
}

function prependChangelogEntry(changelogPath, entry) {
  const absolutePath = path.join(workspaceRoot, changelogPath);
  const existing = fs.readFileSync(absolutePath, 'utf8');
  const next = `${existing.split('\n')[0]}\n\n${entry}${existing.split('\n').slice(2).join('\n')}`;
  fs.writeFileSync(absolutePath, next.endsWith('\n') ? next : `${next}\n`);
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
    const currentStableString = currentVersion.replace(/-.*$/, '');
    const initialRelease = latestTag === null;
    const versionAheadOfTag = latestTag ? compareVersions(currentStableVersion, latestTag.version) > 0 : false;
    const changed = Boolean(bumpInfo.bump) || versionAheadOfTag || initialRelease;
    const targetVersion = pkg.publishTarget === 'vscode'
      ? (
          versionAheadOfTag
            ? currentStableString
            : changed
              ? formatVersion(buildNextVscodeStableVersion(currentStableVersion, bumpInfo.bump))
              : currentStableString
        )
      : (bumpInfo.bump ? formatVersion(incrementVersion(currentStableVersion, bumpInfo.bump)) : currentStableString);
    const reasons = [...bumpInfo.reasons];
    if (initialRelease && !reasons.includes('initial-release')) {
      reasons.push('initial-release');
    }
    if (versionAheadOfTag && !reasons.includes('version-ahead-of-tag')) {
      reasons.push('version-ahead-of-tag');
    }
    if (pkg.publishTarget === 'vscode' && changed && !versionAheadOfTag && !reasons.includes('stable-vscode-even-minor-line')) {
      reasons.push('stable-vscode-even-minor-line');
    }

    return {
      ...pkg,
      currentVersion,
      latestStableTag: latestTag?.tag ?? null,
      latestStableVersion: latestTag ? formatVersion(latestTag.version) : null,
      bump: bumpInfo.bump,
      directBump: directInfo.bump,
      changed,
      targetVersion,
      commits: directInfo.commits,
      reasons,
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
      prereleaseVersion: pkg.publishTarget === 'vscode'
        ? buildVscodePrereleaseVersion(parseVersion(pkg.targetVersion), sequence)
        : `${pkg.targetVersion}-next.${sequence}`,
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
    const changed = latestTag ? compareVersions(currentStableVersion, latestTag.version) > 0 : true;

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
    const originalJson = JSON.stringify(packageJson);

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

    // Only write if content actually changed (avoid formatting-only diffs)
    if (JSON.stringify(packageJson) !== originalJson) {
      writeJson(pkg.packageJsonPath, packageJson);
    }
  }

  if (versionKey === 'targetVersion') {
    for (const pkg of PACKAGES) {
      const pkgPlan = plan.packages.find(item => item.name === pkg.name);
      if (!pkgPlan?.changed) {
        continue;
      }

      const changelogEntry = buildChangelogEntry(pkg, pkgPlan, plan);
      prependChangelogEntry(pkg.changelogPath, changelogEntry);
    }
  }

  return plan;
}

async function main() {
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

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
