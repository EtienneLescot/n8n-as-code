import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Guards the eager import surface of the CLI entrypoint.
 *
 * Command implementations load on demand through the `load` map so that printing a
 * version does not pull in the sync engine, the manager facade and ts-morph. Nothing
 * else enforces that: a single new static import of a heavy module at the top of
 * index.ts silently restores the second of startup it removed, and no other test fails.
 *
 * Type-only imports are erased at compile time and cost nothing at runtime, so they are
 * deliberately ignored here.
 */

const entrypoint = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/index.ts',
);

/**
 * Modules cheap enough to load on every invocation, including `n8nac --version`.
 *
 * Adding to this list is a deliberate decision, not a formality: everything here is paid
 * by every command. Prefer registering the module in the `load` map and importing it
 * inside the `.action()` that needs it.
 */
const ALLOWED_EAGER_IMPORTS = new Set([
    // Argument parsing and output, needed to register commands at all.
    'commander',
    'chalk',
    './utils/option-parsers.js',
    // Node builtins.
    'fs',
    'path',
    'url',
    'module',
    'child_process',
    // Module-scope side effects that must run before any command does.
    './core/services/tls-certificates.js',
    '@n8n-as-code/telemetry',
]);

/** Value imports only: `import type { X } from 'y'` is erased and free. */
function eagerImportSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const importPattern = /^import\s+(type\s+)?[\s\S]*?from\s+'([^']+)';/gm;

    for (const match of source.matchAll(importPattern)) {
        const [statement, typeOnly, specifier] = match;
        if (typeOnly) continue;
        // `import { type A, B }` still loads the module for B; `import { type A }` does not,
        // but treating it as eager only ever makes this guard stricter.
        if (/^import\s*\{\s*type\s[^}]*\}\s*from/.test(statement)) continue;
        specifiers.push(specifier);
    }
    return specifiers;
}

describe('CLI entrypoint startup cost', () => {
    it('loads nothing eagerly beyond the allowlist', () => {
        const source = readFileSync(entrypoint, 'utf8');
        const unexpected = eagerImportSpecifiers(source)
            .filter((specifier) => !ALLOWED_EAGER_IMPORTS.has(specifier));

        expect(
            unexpected,
            `packages/cli/src/index.ts imports these eagerly, so every command pays for them:\n`
            + unexpected.map((s) => `  - ${s}`).join('\n')
            + `\n\nRegister the module in the \`load\` map and import it inside the .action() that`
            + ` needs it, or add it to ALLOWED_EAGER_IMPORTS if it is genuinely cheap.`,
        ).toEqual([]);
    });

    it('still routes command implementations through the load map', () => {
        const source = readFileSync(entrypoint, 'utf8');

        // A sample of the modules the lazy refactor moved off the startup path. If one is
        // reachable without `load`, the map has been bypassed rather than extended.
        for (const lazyModule of [
            './commands/sync.js',
            './commands/credential.js',
            './services/config-service.js',
            '@n8n-as-code/manager-adapter',
        ]) {
            expect(source).toContain(`import('${lazyModule}')`);
        }
    });
});
