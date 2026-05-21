import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type WorkspaceSnapshotLogger = (message: string) => void;

export class WorkspaceSnapshotService {
    private readonly snapshotRoot: string;

    constructor(
        storageRoot: string,
        private readonly log: WorkspaceSnapshotLogger = () => {},
    ) {
        this.snapshotRoot = path.join(storageRoot, 'agent-workspace-snapshots');
    }

    async capture(workspaceRoot: string | undefined, label: string): Promise<string | undefined> {
        if (!workspaceRoot) return undefined;
        const resolvedRoot = path.resolve(workspaceRoot);
        if (!fs.existsSync(resolvedRoot)) return undefined;
        try {
            await this.ensureSnapshotRepo(resolvedRoot);
            await this.git(resolvedRoot, ['add', '-A', '--', '.']);
            const message = `${label}\n\nworkspace: ${resolvedRoot}`;
            const { stdout } = await this.git(resolvedRoot, ['commit', '--allow-empty', '-m', message]);
            const match = stdout.match(/\[[^\s]+(?:\s+\([^)]+\))?\s+([a-f0-9]+)\]/i);
            if (match?.[1]) {
                return await this.revParse(resolvedRoot, match[1]);
            }
            return this.revParse(resolvedRoot, 'HEAD');
        } catch (error: any) {
            this.log(`[n8n-agent] Workspace snapshot failed: ${error?.message || String(error)}`);
            return undefined;
        }
    }

    async restore(workspaceRoot: string | undefined, snapshotId: string | undefined): Promise<void> {
        if (!snapshotId) return;
        if (!workspaceRoot) {
            throw new Error('Cannot restore workspace snapshot without an open workspace.');
        }
        const resolvedRoot = path.resolve(workspaceRoot);
        await this.ensureSnapshotRepo(resolvedRoot);
        await this.capture(resolvedRoot, 'Before checkpoint rewind restore');
        const currentFiles = await this.listTreeFiles(resolvedRoot, 'HEAD');
        await this.removeTrackedFiles(resolvedRoot, currentFiles);
        await this.checkoutTree(resolvedRoot, snapshotId);
        await this.git(resolvedRoot, ['read-tree', snapshotId]);
    }

    private async listTreeFiles(workspaceRoot: string, treeish: string): Promise<string[]> {
        const { stdout } = await this.git(workspaceRoot, ['ls-tree', '-r', '-z', '--name-only', treeish]);
        return stdout.split('\0').filter(Boolean);
    }

    private async removeTrackedFiles(workspaceRoot: string, files: string[]): Promise<void> {
        const directories = new Set<string>();
        for (const file of files) {
            const absolutePath = this.resolveWorkspacePath(workspaceRoot, file);
            directories.add(path.dirname(absolutePath));
            await this.removePathIfPresent(absolutePath);
        }

        const sortedDirectories = Array.from(directories)
            .filter((directory) => path.relative(workspaceRoot, directory))
            .sort((a, b) => b.length - a.length);
        for (const directory of sortedDirectories) {
            await this.removeEmptyDirectory(directory);
        }
    }

    private async removePathIfPresent(absolutePath: string): Promise<void> {
        let stat: fs.Stats;
        try {
            stat = await fs.promises.lstat(absolutePath);
        } catch (error: any) {
            if (error?.code === 'ENOENT') return;
            throw error;
        }

        if (stat.isDirectory() && !stat.isSymbolicLink()) {
            await fs.promises.rm(absolutePath, { recursive: true });
        } else {
            await fs.promises.unlink(absolutePath);
        }
    }

    private async removeEmptyDirectory(absolutePath: string): Promise<void> {
        try {
            await fs.promises.rmdir(absolutePath);
        } catch (error: any) {
            if (error?.code === 'ENOENT' || error?.code === 'ENOTEMPTY' || error?.code === 'EEXIST') return;
            throw error;
        }
    }

    private async checkoutTree(workspaceRoot: string, treeish: string): Promise<void> {
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'n8nac-snapshot-index-'));
        const env = { GIT_INDEX_FILE: path.join(tempDir, 'index') };
        try {
            await this.git(workspaceRoot, ['read-tree', treeish], { env });
            await this.git(workspaceRoot, ['checkout-index', '-a', '-f', `--prefix=${this.checkoutPrefix(workspaceRoot)}`], { env });
        } finally {
            await this.removeTempDirectory(tempDir);
        }
    }

    private async removeTempDirectory(absolutePath: string): Promise<void> {
        try {
            await fs.promises.rm(absolutePath, { recursive: true });
        } catch (error: any) {
            if (error?.code === 'ENOENT') return;
            throw error;
        }
    }

    private checkoutPrefix(workspaceRoot: string): string {
        return workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
    }

    private resolveWorkspacePath(workspaceRoot: string, file: string): string {
        const absolutePath = path.resolve(workspaceRoot, file);
        const relativePath = path.relative(workspaceRoot, absolutePath);
        if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
            throw new Error(`Snapshot path escapes workspace: ${file}`);
        }
        return absolutePath;
    }

    private async ensureSnapshotRepo(workspaceRoot: string): Promise<void> {
        const gitDir = this.gitDir(workspaceRoot);
        if (!fs.existsSync(gitDir)) {
            await fs.promises.mkdir(path.dirname(gitDir), { recursive: true });
            await execFileAsync('git', ['init', '--bare', gitDir], { maxBuffer: 10 * 1024 * 1024 });
        }
        await fs.promises.mkdir(path.join(gitDir, 'info'), { recursive: true });
        await fs.promises.writeFile(
            path.join(gitDir, 'info', 'exclude'),
            [
                '.git',
                '.git/',
                '.git/**',
                '',
            ].join('\n'),
            'utf8',
        );
        await this.git(workspaceRoot, ['config', 'user.name', 'n8n Agent Workbench']);
        await this.git(workspaceRoot, ['config', 'user.email', 'n8n-agent-workbench@localhost']);
        await this.git(workspaceRoot, ['config', 'commit.gpgsign', 'false']);
        await this.git(workspaceRoot, ['config', 'core.autocrlf', 'false']);
    }

    private async revParse(workspaceRoot: string, ref: string): Promise<string> {
        const { stdout } = await this.git(workspaceRoot, ['rev-parse', ref]);
        return stdout.trim();
    }

    private async git(
        workspaceRoot: string,
        args: string[],
        options: { env?: Record<string, string> } = {},
    ): Promise<{ stdout: string; stderr: string }> {
        const result = await execFileAsync('git', [
            `--git-dir=${this.gitDir(workspaceRoot)}`,
            `--work-tree=${workspaceRoot}`,
            ...args,
        ], {
            cwd: workspaceRoot,
            env: options.env ? { ...process.env, ...options.env } : process.env,
            maxBuffer: 50 * 1024 * 1024,
        });
        return {
            stdout: String(result.stdout || ''),
            stderr: String(result.stderr || ''),
        };
    }

    private gitDir(workspaceRoot: string): string {
        const id = createHash('sha256').update(path.resolve(workspaceRoot)).digest('hex').slice(0, 32);
        return path.join(this.snapshotRoot, `${id}.git`);
    }
}
