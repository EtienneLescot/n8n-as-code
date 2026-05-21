import test from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

test('WorktreeService rejects unsafe branch names before creating worktrees', async () => {
    const { WorktreeService } = require('../../src/services/worktree-service.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-worktree-'));
    try {
        const service = new WorktreeService(root);
        await assert.rejects(
            () => service.createWorktree(root, { branchName: '../escape' }),
            /may only contain letters, numbers, dots, underscores, and hyphens/,
        );
        await assert.rejects(
            () => service.createWorktree(root, { branchName: 'feature/name' }),
            /may only contain letters, numbers, dots, underscores, and hyphens/,
        );
        await assert.rejects(
            () => service.createWorktree(root, { branchName: 'unsafe..name' }),
            /not a safe Git branch name/,
        );
        await assert.rejects(
            () => service.createWorktree(root, { branchName: 'unsafe.' }),
            /not a safe Git branch name/,
        );
        await assert.rejects(
            () => service.createWorktree(root, { branchName: 'unsafe.lock' }),
            /not a safe Git branch name/,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('WorktreeService refuses to remove paths outside managed worktrees', async () => {
    const { WorktreeService } = require('../../src/services/worktree-service.js');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-worktree-'));
    try {
        const service = new WorktreeService(root);
        await assert.rejects(
            () => service.removeWorktree(root, path.dirname(root)),
            /outside the managed worktrees directory/,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('WorktreeService refuses to remove unknown managed worktree paths', async () => {
    const { WorktreeService } = require('../../src/services/worktree-service.js');
    const root = await createGitRepo();
    try {
        const service = new WorktreeService(root);
        await assert.rejects(
            () => service.removeWorktree(root, path.join(service.getWorktreesRoot(), 'missing')),
            /unknown worktree path/,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('WorktreeService refuses to remove locked managed worktrees', async () => {
    const { WorktreeService } = require('../../src/services/worktree-service.js');
    const root = await createGitRepo();
    try {
        const service = new WorktreeService(root);
        const worktree = await service.createWorktree(root, { branchName: 'n8n-agent-locked' });
        await execFileAsync('git', ['worktree', 'lock', worktree.path], { cwd: root });

        await assert.rejects(
            () => service.removeWorktree(root, worktree.path),
            /Cannot remove locked worktree/,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('WorktreeService creates and removes known managed worktrees', async () => {
    const { WorktreeService } = require('../../src/services/worktree-service.js');
    const root = await createGitRepo();
    try {
        const service = new WorktreeService(root);
        const worktree = await service.createWorktree(root, { branchName: 'n8n-agent-test' });
        assert.equal(fs.realpathSync(path.dirname(worktree.path)), fs.realpathSync(service.getWorktreesRoot()));
        assert.equal(fs.existsSync(worktree.path), true);

        await service.removeWorktree(root, worktree.path);

        const remaining = await service.listWorktrees(root);
        assert.equal(remaining.some((entry: { path: string }) => entry.path === worktree.path), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

async function createGitRepo(): Promise<string> {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-worktree-repo-'));
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'n8n Agent Workbench'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'n8n-agent-workbench@localhost'], { cwd: root });
    fs.writeFileSync(path.join(root, 'README.md'), '# test\n', 'utf8');
    await execFileAsync('git', ['add', 'README.md'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: root });
    return root;
}
