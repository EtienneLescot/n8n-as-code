/**
 * WorkspaceSetupService
 *
 * Ensures a workflow directory has the files needed for a smooth TypeScript
 * editing experience — no npm install required in the user's workspace:
 *
 *  1. `n8n-workflows.d.ts`  — ambient declarations for @n8n-as-code/transformer.
 *     Eliminates red-squiggle "Cannot find module" errors in .workflow.ts files.
 *
 *  2. `tsconfig.json` (only if absent) — minimal config that enables decorators
 *     and includes the generated declaration file.
 *
 * Both files are written to the workflow sync directory.
 * The .d.ts is always overwritten so it stays up-to-date with new extension/CLI releases.
 * The tsconfig.json is only written once and never overwritten (respects user edits).
 *
 * Responsibility: embedded in `@n8n-as-code/cli` — called by both the VS Code extension
 * and the CLI so the experience is identical regardless of how the workspace
 * was initialised.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Resolve bundled assets path ─────────────────────────────────────────────

// Works in both ESM (import.meta.url) and CJS (__dirname)
const _filename =
    typeof __filename !== 'undefined'
        ? __filename
        : fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// In the built package the assets live next to this file (dist/services/../assets/)
// At source level they live in src/assets/
function resolveAssetPath(filename: string): string {
    // Try sibling assets/ dir (built layout: dist/services/workspace-setup-service.js)
    const candidates = [
        path.join(_dirname, '..', 'assets', filename),   // dist/core/assets/ (built layout)
        path.join(_dirname, 'assets', filename),          // dist/core/services/assets/ (fallback)
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
        `[n8n-as-code] Could not find bundled asset "${filename}". Tried:\n` +
        candidates.map(c => `  ${c}`).join('\n')
    );
}

// ─── Minimal tsconfig.json ────────────────────────────────────────────────────

const TSCONFIG_CONTENT = JSON.stringify(
    {
        compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            experimentalDecorators: true,
            emitDecoratorMetadata: false,
            strict: false,
            noEmit: true,
            skipLibCheck: true,
        },
        include: ['**/*.workflow.ts', '**/*.d.ts'],
        exclude: ['node_modules'],
    },
    null,
    4
);

// ─── Service ──────────────────────────────────────────────────────────────────

export class WorkspaceSetupService {
    /**
     * Ensure TypeScript support files are present in the given workflow directory.
     * Safe to call multiple times — only writes when content has actually changed.
     *
     * @param workflowDir  Absolute path to the directory that contains .workflow.ts files
     */
    static ensureWorkspaceFiles(workflowDir: string): void {
        fs.mkdirSync(workflowDir, { recursive: true });

        WorkspaceSetupService.writeDeclarationFile(workflowDir);
        WorkspaceSetupService.writeTsConfig(workflowDir);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Copy / overwrite the bundled .d.ts stub so it stays current */
    private static writeDeclarationFile(dir: string): void {
        let stubContent: string;
        try {
            const src = resolveAssetPath('n8n-workflows.d.ts');
            stubContent = fs.readFileSync(src, 'utf-8');
        } catch (err: any) {
            console.warn('[n8n-as-code] WorkspaceSetupService:', err.message);
            return;
        }

        const dest = path.join(dir, 'n8n-workflows.d.ts');
        WorkspaceSetupService.writeIfChanged(dest, stubContent);
    }

    /** Write tsconfig.json, overwriting if content has changed (keeps existing workspaces up to date) */
    private static writeTsConfig(dir: string): void {
        const dest = path.join(dir, 'tsconfig.json');
        WorkspaceSetupService.writeIfChanged(dest, TSCONFIG_CONTENT);
    }

    /** Write only when content differs (avoids unnecessary git dirty state) */
    private static writeIfChanged(filePath: string, content: string): void {
        const existing = fs.existsSync(filePath)
            ? fs.readFileSync(filePath, 'utf-8')
            : null;
        if (existing !== content) {
            fs.writeFileSync(filePath, content, 'utf-8');
        }
    }
}
