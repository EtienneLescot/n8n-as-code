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
        this.worktreesRoot = path.join(workspaceRoot, '.kilo', 'worktrees');
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
        const branchName = options.branchName || `n8n-agent-${Date.now().toString(36)}`;
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
        const created = worktrees.find((wt) => wt.path === worktreePath);
        if (!created) {
            throw new Error('Worktree created but not found in listing.');
        }
        return created;
    }

    async removeWorktree(repoPath: string, worktreePath: string, force = false): Promise<void> {
        const args = ['worktree', 'remove'];
        if (force) args.push('--force');
        args.push(worktreePath);

        try {
            await execFileAsync('git', args, {
                cwd: repoPath,
                maxBuffer: 10 * 1024 * 1024,
            });
            this.log(`[n8n-worktree] Removed worktree at ${worktreePath}`);
        } catch (error: any) {
            const message = error?.message || String(error);
            this.log(`[n8n-worktree] Remove failed: ${message}`);
            throw new Error(`Failed to remove worktree: ${message}`);
        }
    }

    getWorktreesRoot(): string {
        return this.worktreesRoot;
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
}
