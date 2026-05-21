import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface WorktreeInfo {
    path: string;
    head: string;
    branch?: string;
    bare: boolean;
    detached: boolean;
    locked: boolean;
}

export interface CreateWorktreeOptions {
    branchName?: string;
    baseBranch?: string;
    detach?: boolean;
}

export type WorktreeLogger = (message: string) => void;

export class WorktreeService {
    private readonly worktreesRoot: string;

    constructor(
        workspaceRoot: string,
        private readonly log: WorktreeLogger = () => {},
    ) {
        this.worktreesRoot = path.join(workspaceRoot, '.n8nac', 'worktrees');
    }

    async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
        try {
            const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
                cwd: repoPath,
                maxBuffer: 1024 * 1024,
            });
            return this.parseWorktreePorcelain(stdout);
        } catch (error: any) {
            this.log(`[n8n-worktree] List failed: ${error?.message || String(error)}`);
            return [];
        }
    }

    async createWorktree(repoPath: string, options: CreateWorktreeOptions = {}): Promise<WorktreeInfo> {
        const branchName = this.normalizeBranchName(options.branchName || `n8n-agent-${Date.now().toString(36)}`);
        const worktreePath = path.join(this.worktreesRoot, branchName);
        fs.mkdirSync(this.worktreesRoot, { recursive: true });

        const args = ['worktree', 'add'];
        if (options.detach) {
            args.push('--detach');
        } else {
            args.push('-b', branchName);
        }
        args.push(worktreePath);
        if (options.baseBranch) {
            args.push(options.baseBranch);
        }

        try {
            await execFileAsync('git', args, {
                cwd: repoPath,
                maxBuffer: 10 * 1024 * 1024,
            });
            this.log(`[n8n-worktree] Created worktree at ${worktreePath} branch=${branchName}`);
        } catch (error: any) {
            const message = error?.message || String(error);
            this.log(`[n8n-worktree] Create failed: ${message}`);
            throw new Error(`Failed to create worktree: ${message}`);
        }

        const worktrees = await this.listWorktrees(repoPath);
        const created = await this.findWorktreeByPath(worktrees, worktreePath);
        if (!created) {
            throw new Error('Worktree created but not found in listing.');
        }
        return created;
    }

    async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
        const resolvedWorktreePath = this.resolveManagedWorktreePath(worktreePath);
        const worktrees = await this.listWorktrees(repoPath);
        const knownWorktree = await this.findWorktreeByPath(worktrees, resolvedWorktreePath);
        if (!knownWorktree) {
            throw new Error('Refusing to remove unknown worktree path.');
        }
        if (knownWorktree.locked) {
            throw new Error('Cannot remove locked worktree. Unlock it with Git before deleting it.');
        }

        try {
            await execFileAsync('git', ['worktree', 'remove', resolvedWorktreePath], {
                cwd: repoPath,
                maxBuffer: 10 * 1024 * 1024,
            });
            this.log(`[n8n-worktree] Removed worktree at ${resolvedWorktreePath}`);
        } catch (error: any) {
            const message = this.formatRemoveError(error);
            this.log(`[n8n-worktree] Remove failed: ${message}`);
            throw new Error(`Failed to remove worktree: ${message}`);
        }
    }

    getWorktreesRoot(): string {
        return this.worktreesRoot;
    }

    private normalizeBranchName(value: string): string {
        const branchName = value.trim();
        if (!branchName) {
            throw new Error('Worktree branch name is required.');
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(branchName)) {
            throw new Error('Worktree branch name may only contain letters, numbers, dots, underscores, and hyphens.');
        }
        if (branchName.endsWith('.') || branchName.includes('..') || branchName.endsWith('.lock')) {
            throw new Error('Worktree branch name is not a safe Git branch name.');
        }
        return branchName;
    }

    private resolveManagedWorktreePath(worktreePath: string): string {
        const resolvedRoot = path.resolve(this.worktreesRoot);
        const resolvedWorktreePath = path.resolve(worktreePath);

        try {
            const realRoot = fs.realpathSync(this.worktreesRoot);
            const realWorktreePath = fs.realpathSync(worktreePath);
            if (!this.isManagedChildPath(realRoot, realWorktreePath)) {
                throw new Error('Refusing to remove worktree outside the managed worktrees directory.');
            }
            return realWorktreePath;
        } catch (error: any) {
            if (error?.code !== 'ENOENT') {
                throw error;
            }
        }

        if (!this.isManagedChildPath(resolvedRoot, resolvedWorktreePath)) {
            throw new Error('Refusing to remove worktree outside the managed worktrees directory.');
        }
        return resolvedWorktreePath;
    }

    private isManagedChildPath(rootPath: string, childPath: string): boolean {
        const relativePath = path.relative(rootPath, childPath);
        return Boolean(relativePath) && relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
    }

    private async findWorktreeByPath(worktrees: WorktreeInfo[], worktreePath: string): Promise<WorktreeInfo | undefined> {
        const expectedPath = await this.canonicalPath(worktreePath);
        for (const worktree of worktrees) {
            if (await this.canonicalPath(worktree.path) === expectedPath) {
                return worktree;
            }
        }
        return undefined;
    }

    private async canonicalPath(value: string): Promise<string> {
        try {
            return await fs.promises.realpath(value);
        } catch {
            return path.resolve(value);
        }
    }

    private parseWorktreePorcelain(output: string): WorktreeInfo[] {
        const lines = output.trim().split('\n');
        const result: WorktreeInfo[] = [];
        let current: Partial<WorktreeInfo> = {};

        for (const line of lines) {
            if (line === '') {
                if (current.path) {
                    result.push({
                        path: current.path,
                        head: current.head || '',
                        branch: current.branch,
                        bare: current.bare ?? false,
                        detached: current.detached ?? false,
                        locked: current.locked ?? false,
                    });
                }
                current = {};
                continue;
            }

            const spaceIndex = line.indexOf(' ');
            const key = spaceIndex >= 0 ? line.slice(0, spaceIndex) : line;
            const value = spaceIndex >= 0 ? line.slice(spaceIndex + 1) : '';

            switch (key) {
                case 'worktree':
                    current.path = value;
                    break;
                case 'HEAD':
                    current.head = value;
                    break;
                case 'branch':
                    current.branch = value;
                    break;
                case 'bare':
                    current.bare = true;
                    break;
                case 'detached':
                    current.detached = true;
                    break;
                case 'locked':
                    current.locked = true;
                    break;
            }
        }

        if (current.path) {
            result.push({
                path: current.path,
                head: current.head || '',
                branch: current.branch,
                bare: current.bare ?? false,
                detached: current.detached ?? false,
                locked: current.locked ?? false,
            });
        }

        return result;
    }

    private formatRemoveError(error: any): string {
        const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
        const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
        const message = [stderr, stdout, error?.message || String(error)].filter(Boolean).join('\n').trim();
        if (/contains modified or untracked files|contains.*uncommitted|is dirty/i.test(message)) {
            return 'Cannot remove worktree because it contains uncommitted changes. Commit, stash, or discard those changes first.';
        }
        return message || 'Unknown git worktree remove error.';
    }
}
