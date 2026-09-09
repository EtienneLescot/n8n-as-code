#!/usr/bin/env node
/**
 * This entry point is primarily for internal/dev or legacy setups that still
 * invoke an `n8nac-skills` binary directly. New installs should invoke skills via:
 *   npx n8nac@<version> skills <command>
 */
import { Command } from 'commander';
import fs, { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerSkillsCommands } from './cli-entry.js';
import { resolveSkillsAssetsDir } from './services/assets-dir.js';

// Resolve __dirname for ESM and CJS (bundled)
const _filename = typeof import.meta !== 'undefined' && import.meta.url
    ? fileURLToPath(import.meta.url)
    : (typeof __filename !== 'undefined' ? __filename : '');

const _dirname = typeof __dirname !== 'undefined'
    ? __dirname
    : dirname(_filename as string);

const getVersion = () => {
    try {
        const pkgPath = join(_dirname, '../package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        return pkg.version;
    } catch {
        return '0.1.0';
    }
};

const assetsDir = resolveSkillsAssetsDir();

const program = new Command();
program
    .name('n8nac-skills')
    .description('AI Agent Skills (use `npx n8nac skills` for the latest version)')
    .version(getVersion());

registerSkillsCommands(program, assetsDir);

program.parse(process.argv);
