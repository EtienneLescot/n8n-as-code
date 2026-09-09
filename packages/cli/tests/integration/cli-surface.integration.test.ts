import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Guards the registered command surface against the lazy-loading refactor in index.ts.
 *
 * Commands are registered eagerly with commander while their implementation modules load
 * on demand inside `.action()`. Nothing else in the suite asserts on `--help`, so a
 * command that silently stops being registered — the failure mode for `update-ai`, whose
 * registration lives in a constructor rather than in index.ts — would otherwise ship.
 */

const INTEGRATION_TIMEOUT = 30_000;

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');

/** Every top-level command the CLI is expected to expose. */
/** Every top-level command, listed in `--help` or not. All must remain runnable. */
const TOP_LEVEL_COMMANDS = [
    'telemetry', 'workspace', 'env', 'setup', 'setup-modes', 'credentials',
    'list', 'find', 'pull', 'push', 'promote', 'verify', 'test', 'test-plan',
    'fetch', 'resolve', 'convert', 'convert-batch', 'native-mcp', 'mcp',
    'workflow', 'execution', 'credential', 'skills', 'update-ai',
];

/** The commands the top-level index is expected to show. */
const LISTED_COMMANDS = TOP_LEVEL_COMMANDS.filter((c) => ![
    'telemetry', 'find', 'fetch', 'mcp', 'setup-modes',
].includes(c));

function runCli(args: string[]): string {
    return execFileSync('node', [cliEntry, ...args], {
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        encoding: 'utf8',
    });
}

/** Command names as commander prints them: two-space indent, then the name. */
function listedCommands(helpOutput: string): string[] {
    const commandsSection = helpOutput.slice(helpOutput.indexOf('Commands:'));
    return [...commandsSection.matchAll(/^ {2}([a-z][a-z0-9-]*)/gm)].map((m) => m[1]);
}

describe('CLI command surface', () => {
    it('lists every top-level command in --help', () => {
        const listed = listedCommands(runCli(['--help']));
        for (const command of LISTED_COMMANDS) {
            expect(listed).toContain(command);
        }
    }, INTEGRATION_TIMEOUT);

    it('resolves each top-level command instead of reporting it as unknown', () => {
        // `--help` on a command forces commander to find it, without running its action.
        for (const command of TOP_LEVEL_COMMANDS) {
            expect(() => runCli([command, '--help'])).not.toThrow();
        }
    }, INTEGRATION_TIMEOUT * 4);

    it('reports the environment a workspace .env already resolves, instead of denying it', () => {
        // `setup` used to ask "is an environment listed on disk?", which a workspace `.env`
        // makes the wrong question: it printed "No workspace environment configured yet"
        // right after one had become available, and its suggested `env add` then failed
        // with "already exists".
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-setup-'));
        try {
            fs.writeFileSync(
                path.join(dir, '.env'),
                'N8N_HOST=https://setup-probe.example.test\nN8N_API_KEY=probe-key\n',
                'utf8',
            );

            const out = execFileSync('node', [cliEntry, 'setup', '--mode', 'connect-existing',
                '--host', 'https://setup-probe.example.test', '--json'], {
                cwd: dir,
                env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
                encoding: 'utf8',
            });

            const parsed = JSON.parse(out);
            expect(parsed.workspaceEnvironment).toContain('https://setup-probe.example.test');
            expect(parsed.nextSteps).toBeUndefined();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, INTEGRATION_TIMEOUT);

    it("exposes the options of update-ai, the one command registered by hand", () => {
        // Every other command carries its options with its implementation. update-ai is
        // registered directly in index.ts so the module can load lazily, which makes its
        // option list the one that can silently drift out of the CLI.
        const help = runCli(['update-ai', '--help']);

        for (const option of ['--n8n-version', '--cli-version', '--cli-cmd', '--manager-cmd', '--silent']) {
            expect(help).toContain(option);
        }
    }, INTEGRATION_TIMEOUT);

    it('keeps the top-level index short while every command stays reachable', () => {
        // An install probe agent read a 25-command listing in two passes, then gave up and
        // grepped the compiled bundle to enumerate commands. Hidden commands are trimmed
        // from the index only: each still runs and still documents itself.
        const listed = listedCommands(runCli(['--help']));
        const hidden = ['telemetry', 'find', 'fetch', 'mcp', 'setup-modes'];

        for (const command of hidden) {
            expect(listed).not.toContain(command);
            expect(() => runCli([command, '--help'])).not.toThrow();
        }
        // Not a target, a ratchet: the index is already long enough that an agent read it
        // in two passes, so growing it further should be a deliberate act.
        expect(listed.length).toBeLessThanOrEqual(22);
    }, INTEGRATION_TIMEOUT * 4);

    it('prints a version without loading a command module', () => {
        expect(runCli(['--version']).trim()).toMatch(/^\d+\.\d+\.\d+/);
    }, INTEGRATION_TIMEOUT);
});
