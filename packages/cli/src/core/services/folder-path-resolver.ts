import { IFolder, IWorkflow } from '../types.js';

const WINDOWS_RESERVED_FILENAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export function sanitizePathSegment(name: string): string {
    let safeName = (name || '')
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    if (!safeName || safeName === '.' || safeName === '..') safeName = 'folder';

    const firstDotIndex = safeName.indexOf('.');
    const baseName = firstDotIndex === -1 ? safeName : safeName.slice(0, firstDotIndex);
    const rest = firstDotIndex === -1 ? '' : safeName.slice(firstDotIndex);
    if (WINDOWS_RESERVED_FILENAMES.has(baseName.toUpperCase())) {
        safeName = `${baseName}_${rest}`;
    }

    return safeName.replace(/[. ]+$/g, '') || 'folder';
}

export class FolderPathResolver {
    private foldersById = new Map<string, IFolder>();
    private memo = new Map<string, string[]>();
    private siblingSegmentById = new Map<string, string>();

    constructor(folders: IFolder[]) {
        for (const folder of folders) {
            if (folder?.id) this.foldersById.set(folder.id, folder);
        }
        this.buildSiblingSegments(folders);
    }

    getPathForWorkflow(workflow: IWorkflow): string[] {
        const folderId = workflow.parentFolderId ?? workflow.parentFolder?.id ?? null;
        if (!folderId) return [];
        return this.getPathForFolderId(folderId);
    }

    getPathForFolderId(folderId: string): string[] {
        return this.resolve(folderId, new Set());
    }

    private buildSiblingSegments(folders: IFolder[]): void {
        const siblings = new Map<string, IFolder[]>();
        for (const folder of folders) {
            const parentKey = folder.parentFolderId ?? '';
            const current = siblings.get(parentKey) ?? [];
            current.push(folder);
            siblings.set(parentKey, current);
        }

        for (const group of siblings.values()) {
            const used = new Map<string, string>();
            for (const folder of group.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
                const base = sanitizePathSegment(folder.name);
                let segment = base;
                const existingId = used.get(segment.toLowerCase());
                if (existingId && existingId !== folder.id) {
                    segment = `${base}_${folder.id.slice(0, 8)}`;
                }
                used.set(segment.toLowerCase(), folder.id);
                this.siblingSegmentById.set(folder.id, segment);
            }
        }
    }

    private resolve(folderId: string, seen: Set<string>): string[] {
        const cached = this.memo.get(folderId);
        if (cached) return cached;

        const folder = this.foldersById.get(folderId);
        if (!folder || seen.has(folderId)) {
            const fallback = ['_Unresolved Folder', sanitizePathSegment(folderId)];
            this.memo.set(folderId, fallback);
            return fallback;
        }

        seen.add(folderId);
        const parentSegments = folder.parentFolderId
            ? this.resolve(folder.parentFolderId, seen)
            : [];
        const segment = this.siblingSegmentById.get(folderId) ?? sanitizePathSegment(folder.name);
        const segments = [...parentSegments, segment];
        this.memo.set(folderId, segments);
        seen.delete(folderId);
        return segments;
    }
}
