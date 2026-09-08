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
const TOP_LEVEL_COMMANDS = [
    'telemetry', 'workspace', 'env', 'setup', 'setup-modes', 'credentials',
    'list', 'find', 'pull', 'push', 'promote', 'verify', 'test', 'test-plan',
    'fetch', 'resolve', 'convert', 'convert-batch', 'native-mcp', 'mcp',
    'workflow', 'execution', 'credential', 'skills', 'update-ai',
];

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
        for (const command of TOP_LEVEL_COMMANDS) {
            expect(listed).toContain(command);
        }
    }, INTEGRATION_TIMEOUT);

    it('resolves each top-level command instead of reporting it as unknown', () => {
        // `--help` on a command forces commander to find it, without running its action.
        for (const command of TOP_LEVEL_COMMANDS) {
            expect(() => runCli([command, '--help'])).not.toThrow();
        }
    }, INTEGRATION_TIMEOUT * 4);

    it('prints a version without loading a command module', () => {
        expect(runCli(['--version']).trim()).toMatch(/^\d+\.\d+\.\d+/);
    }, INTEGRATION_TIMEOUT);
});
