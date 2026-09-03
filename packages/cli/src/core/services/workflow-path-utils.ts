import fs from 'fs';
import path from 'path';

/**
 * Rewrites a path to POSIX separators.
 *
 * Workflow paths are stored POSIX-style in `.n8n-state.json` so a repository
 * checked out on Windows and on Linux produces the same state file.
 */
export function toPosixRelativePath(value: string): string {
    return value.split(path.sep).join('/').replace(/\\/g, '/');
}

/**
 * Normalises a workflow path relative to the workflows directory and rejects
 * anything that could escape it.
 *
 * @param value Path as written by a user, a state file, or the CLI.
 * @returns The normalised POSIX-relative path.
 * @throws If the path is empty, absolute, climbs above the root, or contains a
 * control character — all of which would let a crafted state file or filename
 * write outside the sync scope.
 */
export function normalizeWorkflowRelativePath(value: string): string {
    const normalized = path.posix.normalize(toPosixRelativePath(value).trim());
    if (!normalized || normalized === '.') {
        throw new Error('Workflow path must not be empty');
    }
    if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
        throw new Error(`Workflow path escapes the sync scope: ${value}`);
    }
    const parts = normalized.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part))) {
        throw new Error(`Workflow path contains an unsafe segment: ${value}`);
    }
    return normalized;
}

/**
 * Resolves a workflow-relative path against the workflows directory.
 *
 * Validates before joining, so this is the only sanctioned way to turn a stored
 * filename into an absolute path.
 *
 * @param root Absolute path of the workflows directory.
 * @param relativePath Workflow-relative path (nested paths allowed).
 */
export function workflowRelativePathToAbsolute(root: string, relativePath: string): string {
    const safeRelativePath = normalizeWorkflowRelativePath(relativePath);
    return path.join(root, ...safeRelativePath.split('/'));
}

/**
 * Inverse of {@link workflowRelativePathToAbsolute}: expresses an absolute path
 * as a validated workflow-relative one.
 *
 * @throws If the file lies outside `root`.
 */
export function relativePathFromAbsolute(root: string, absolutePath: string): string {
    const relative = path.relative(root, absolutePath);
    return normalizeWorkflowRelativePath(toPosixRelativePath(relative));
}

/**
 * Creates the parent directory of `filePath` if it is missing.
 *
 * Needed since workflows can live in nested folders: the first pull or push of
 * `Reports/Weekly/summary.workflow.ts` has to create `Reports/Weekly` first.
 */
export function ensureParentDirectory(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * Lists every `*.workflow.ts` file under `root`, recursively.
 *
 * Dot-prefixed entries are skipped, so `.n8n-state.json` and `.git` never show
 * up. Results are workflow-relative, normalised, and sorted for deterministic
 * ordering across platforms.
 *
 * Synchronous by design — it runs inside the tracker's synchronous scan path.
 * Fine for the hundreds of workflows a project realistically holds.
 *
 * @returns Sorted workflow-relative paths; empty when `root` does not exist.
 */
export function listWorkflowFilesRecursive(root: string): string[] {
    const results: string[] = [];
    const visit = (dir: string, relativeDir = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const childRelative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
            const childAbsolute = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(childAbsolute, childRelative);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith('.workflow.ts')) {
                results.push(normalizeWorkflowRelativePath(childRelative));
            }
        }
    };
    if (fs.existsSync(root)) visit(root);
    return results.sort();
}
