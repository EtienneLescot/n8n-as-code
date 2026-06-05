import fs from 'fs';
import path from 'path';

export function toPosixRelativePath(value: string): string {
    return value.split(path.sep).join('/').replace(/\\/g, '/');
}

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

export function workflowRelativePathToAbsolute(root: string, relativePath: string): string {
    const safeRelativePath = normalizeWorkflowRelativePath(relativePath);
    return path.join(root, ...safeRelativePath.split('/'));
}

export function relativePathFromAbsolute(root: string, absolutePath: string): string {
    const relative = path.relative(root, absolutePath);
    return normalizeWorkflowRelativePath(toPosixRelativePath(relative));
}

export function ensureParentDirectory(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

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
