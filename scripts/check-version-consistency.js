#!/usr/bin/env node
/**
 * Script to check version consistency across all packages in the monorepo.
 * This ensures that internal dependencies are properly synchronized by Changeset.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const PACKAGES = [
  'packages/sync',
  'packages/cli',
  'packages/skills',
  'packages/vscode-extension'
];

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readPackageJson(packagePath) {
  const fullPath = join(rootDir, packagePath, 'package.json');
  try {
    return JSON.parse(readFileSync(fullPath, 'utf-8'));
  } catch (error) {
    log('red', `❌ Error reading ${fullPath}: ${error.message}`);
    return null;
  }
}

function main() {
  log('cyan', '\n=== 🔍 Checking Internal Dependencies Consistency ===\n');
  log('yellow', '📌 Note: Packages have independent versions (as intended).');
  log('yellow', '📌 This script verifies that internal dependencies reference the current versions.\n');

  // Step 1: Collect all package versions
  const packageVersions = new Map();
  const packageData = new Map();

  for (const pkgPath of PACKAGES) {
    const pkg = readPackageJson(pkgPath);
    if (!pkg) continue;

    packageVersions.set(pkg.name, pkg.version);
    packageData.set(pkg.name, { path: pkgPath, pkg });

    log('blue', `📦 ${pkg.name}: v${pkg.version}`);
  }

  console.log('');

  // Step 2: Check internal dependencies
  let hasErrors = false;
  const checkedDeps = [];

  for (const [name, { path, pkg }] of packageData) {
    if (!pkg.dependencies) continue;

    for (const [depName, depVersion] of Object.entries(pkg.dependencies)) {
      // Check if it's an internal dependency
      if (packageVersions.has(depName)) {
        const actualVersion = packageVersions.get(depName);
        const declaredVersion = depVersion.replace(/[\^~]/, ''); // Remove ^ or ~

        checkedDeps.push({
          consumer: name,
          dependency: depName,
          declared: declaredVersion,
          actual: actualVersion,
          ok: actualVersion === declaredVersion
        });

        if (actualVersion !== declaredVersion) {
          hasErrors = true;
          log('red', `❌ Outdated dependency in ${name}:`);
          log('red', `   Depends on: ${depName}`);
          log('red', `   Declared version: ${declaredVersion}`);
          log('red', `   Current version: ${actualVersion}`);
          log('yellow', `   → Should be updated to: ${actualVersion}`);
          console.log('');
        }
      }
    }
  }

  // Step 3: Summary
  console.log('');
  if (hasErrors) {
    log('red', '❌ Outdated internal dependencies detected!');
    log('yellow', '\n💡 Solution: Run `npm run version-packages` to update internal dependencies.');
    log('yellow', '   Changeset will automatically update dependencies to reference current versions.');
    process.exit(1);
  } else {
    log('green', `✅ All internal dependencies are up-to-date! (${checkedDeps.length} dependencies checked)`);

    if (checkedDeps.length > 0) {
      console.log('');
      log('cyan', '✓ Verified dependencies:');
      for (const dep of checkedDeps) {
        console.log(`   ${dep.consumer} → ${dep.dependency}@${dep.declared}`);
      }
    }

    // Show package publication info
    console.log('');
    log('cyan', '📊 Package Publication Status:');
    for (const [name, { pkg }] of packageData) {
      const isPrivate = pkg.private === true;
      const status = isPrivate ? '🔒 Private (not published to NPM)' : '📤 Public (published to NPM)';
      console.log(`   ${name}: ${status}`);
    }
  }

  console.log('');
}

main();
