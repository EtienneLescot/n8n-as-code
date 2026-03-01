#!/usr/bin/env node
/**
 * Promote next branch to main by stripping the `-next` suffix from all package versions
 * and pinning internal dependencies to their exact stable versions.
 *
 * Usage: node scripts/promote-next-to-main.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PACKAGES = [
    'packages/transformer',
    'packages/skills',
    'packages/cli',
    'packages/vscode-extension',
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Step 1: Read all base stable versions (strip -next suffix)
const versions = {};
for (const pkg of PACKAGES) {
    const pkgPath = path.join(root, pkg, 'package.json');
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const stable = json.version.replace(/-next.*$/, '');
    const name = json.name;
    versions[name] = stable;
    console.log(`${name}: ${json.version} → ${stable}`);
}

// Step 2: Update versions and pin internal deps to stable
for (const pkg of PACKAGES) {
    const pkgPath = path.join(root, pkg, 'package.json');
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Strip -next from own version
    json.version = json.version.replace(/-next.*$/, '');

    // Pin internal deps to exact stable versions
    for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (!json[depField]) continue;
        for (const [dep, ver] of Object.entries(json[depField])) {
            if (versions[dep] && (ver === '*' || ver.includes('-next'))) {
                json[depField][dep] = versions[dep];
                console.log(`  ${json.name}: ${dep} → ${versions[dep]}`);
            }
        }
    }

    fs.writeFileSync(pkgPath, JSON.stringify(json, null, 4) + '\n');
}

console.log('\n✅ Done. Review changes, then:');
console.log('   git add packages/*/package.json');
console.log('   git commit -m "chore: promote next to stable"');
console.log('   git push origin next');
console.log('   gh pr create --base main --head next --title "chore: release next → main"');
