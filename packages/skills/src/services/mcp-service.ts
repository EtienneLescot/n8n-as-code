import { spawn } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

export interface SkillsMcpServiceOptions {
    assetsDir: string;
    cwd?: string;
}

export interface ValidateWorkflowOptions {
    workflowContent: string;
    format?: 'auto' | 'json' | 'typescript';
}

export interface CliExecutionResult {
    command: string[];
    cwd: string;
    exitCode: number;
    success: boolean;
    stdout: string;
    stderr: string;
    parsedJson?: unknown;
}

function detectWorkflowFormat(workflowContent: string, format: 'auto' | 'json' | 'typescript' = 'auto'): boolean {
    if (format === 'typescript') {
        return true;
    }

    if (format === 'json') {
        return false;
    }

    const trimmed = workflowContent.trim();
    return trimmed.startsWith('import ')
        || trimmed.startsWith('@workflow')
        || trimmed.includes('export class');
}

export class SkillsMcpService {
    readonly cwd: string;

    constructor(options: SkillsMcpServiceOptions) {
        this.cwd = options.cwd || process.cwd();
    }

    private getCliEntryPath(): string {
        const currentArgvEntry = process.argv[1];
        if (currentArgvEntry && existsSync(currentArgvEntry)) {
            return currentArgvEntry;
        }

        const currentDir = dirname(fileURLToPath(import.meta.url));
        const monorepoCliEntry = resolve(currentDir, '../../../cli/dist/index.js');
        if (existsSync(monorepoCliEntry)) {
            return monorepoCliEntry;
        }

        throw new Error('Unable to resolve the n8nac CLI entrypoint for MCP operational tools.');
    }

    private async runCliCommand(args: string[], parseJson: boolean = false): Promise<CliExecutionResult> {
        const cliEntryPath = this.getCliEntryPath();

        return new Promise((resolvePromise, reject) => {
            const child = spawn(process.execPath, [cliEntryPath, ...args], {
                cwd: this.cwd,
                env: {
                    ...process.env,
                    FORCE_COLOR: '0',
                    NO_COLOR: '1',
                },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk) => {
                stdout += chunk.toString();
            });

            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString();
            });

            child.on('error', reject);
            child.on('close', (exitCode) => {
                const trimmedStdout = stdout.trim();
                const result: CliExecutionResult = {
                    command: [process.execPath, cliEntryPath, ...args],
                    cwd: this.cwd,
                    exitCode: exitCode ?? 1,
                    success: exitCode === 0,
                    stdout: trimmedStdout,
                    stderr: stderr.trim(),
                };

                if (parseJson && trimmedStdout) {
                    try {
                        result.parsedJson = JSON.parse(trimmedStdout);
                    } catch (error: any) {
                        result.parsedJson = {
                            parseError: error.message,
                            raw: trimmedStdout,
                        };
                    }
                }

                resolvePromise(result);
            });
        });
    }

    private async runCliJsonCommand(args: string[]): Promise<any> {
        const result = await this.runCliCommand(args, true);
        if (!result.success) {
            throw new Error(result.stderr || result.stdout || `CLI command failed: ${args.join(' ')}`);
        }
        if (result.parsedJson && !(typeof result.parsedJson === 'object' && 'parseError' in (result.parsedJson as Record<string, unknown>))) {
            return result.parsedJson;
        }
        throw new Error(`CLI command did not return valid JSON: ${args.join(' ')}`);
    }

    searchKnowledge(query: string, options: { category?: string; type?: 'node' | 'documentation'; limit?: number } = {}) {
        const args = ['skills', 'search', query, '--json'];
        if (options.category) args.push('--category', options.category);
        if (options.type) args.push('--type', options.type);
        if (options.limit) args.push('--limit', String(options.limit));
        return this.runCliJsonCommand(args);
    }

    getNodeInfo(name: string) {
        return this.runCliJsonCommand(['skills', 'node-info', name, '--json']);
    }

    async searchDocs(query: string, options: {
        category?: string;
        type?: 'node' | 'documentation';
        limit?: number;
    } = {}) {
        const args = ['skills', 'search', query, '--json'];
        if (options.category) args.push('--category', options.category);
        args.push('--type', options.type ?? 'documentation');
        if (options.limit) args.push('--limit', String(options.limit));

        const result = await this.runCliJsonCommand(args);
        return Array.isArray(result?.results) ? result.results : result;
    }

    searchExamples(query: string, limit: number = 10) {
        return this.runCliJsonCommand(['skills', 'examples', 'search', query, '--json', '--limit', String(limit)]);
    }

    getExampleInfo(id: string) {
        return this.runCliJsonCommand(['skills', 'examples', 'info', id, '--json']);
    }

    async validateWorkflow({ workflowContent, format = 'auto' }: ValidateWorkflowOptions) {
        const isTypeScript = detectWorkflowFormat(workflowContent, format);
        const tempDir = mkdtempSync(join(tmpdir(), 'n8nac-mcp-validate-'));
        const extension = isTypeScript ? '.workflow.ts' : '.json';
        const tempFile = join(tempDir, `workflow${extension}`);

        try {
            if (!isTypeScript) {
                try {
                    JSON.parse(workflowContent);
                } catch (error: any) {
                    throw new Error(`Invalid JSON workflow content: ${error.message}`);
                }
            }

            writeFileSync(tempFile, workflowContent, 'utf8');
            return await this.runCliJsonCommand(['skills', 'validate', tempFile, '--json']);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    }

    readWorkflowFile(path: string) {
        return readFileSync(path, 'utf8');
    }

    listWorkflows(options: {
        local?: boolean;
        remote?: boolean;
        search?: string;
        sort?: 'status' | 'name';
        limit?: number;
    } = {}) {
        const args = ['list', '--raw'];
        if (options.local) args.push('--local');
        if (options.remote) args.push('--remote');
        if (options.search) args.push('--search', options.search);
        if (options.sort) args.push('--sort', options.sort);
        if (options.limit) args.push('--limit', String(options.limit));
        return this.runCliCommand(args, true);
    }

    findWorkflows(options: {
        query: string;
        local?: boolean;
        remote?: boolean;
        sort?: 'status' | 'name';
        limit?: number;
    }) {
        const args = ['find', options.query, '--raw'];
        if (options.local) args.push('--local');
        if (options.remote) args.push('--remote');
        if (options.sort) args.push('--sort', options.sort);
        if (options.limit) args.push('--limit', String(options.limit));
        return this.runCliCommand(args, true);
    }

    fetchWorkflow(workflowId: string) {
        return this.runCliCommand(['fetch', workflowId]);
    }

    pullWorkflow(workflowId: string) {
        return this.runCliCommand(['pull', workflowId]);
    }

    pushWorkflow(filename: string, options: { verify?: boolean } = {}) {
        const args = ['push', filename];
        if (options.verify) args.push('--verify');
        return this.runCliCommand(args);
    }

    verifyRemoteWorkflow(workflowId: string) {
        return this.runCliCommand(['verify', workflowId]);
    }

    testWorkflow(workflowId: string, options: { prod?: boolean; data?: unknown } = {}) {
        const args = ['test', workflowId];
        if (options.prod) args.push('--prod');
        if (options.data !== undefined) args.push('--data', JSON.stringify(options.data));
        return this.runCliCommand(args);
    }

    getWorkflowTestPlan(workflowId: string) {
        return this.runCliCommand(['test-plan', workflowId, '--json'], true);
    }

    resolveWorkflowConflict(workflowId: string, mode: 'keep-current' | 'keep-incoming') {
        return this.runCliCommand(['resolve', workflowId, '--mode', mode]);
    }

    convertWorkflow(options: {
        file: string;
        output?: string;
        force?: boolean;
        format?: 'json' | 'typescript';
    }) {
        const args = ['convert', options.file];
        if (options.output) args.push('--output', options.output);
        if (options.force) args.push('--force');
        if (options.format) args.push('--format', options.format);
        return this.runCliCommand(args);
    }

    convertWorkflowsBatch(options: {
        directory: string;
        format: 'json' | 'typescript';
        force?: boolean;
    }) {
        const args = ['convert-batch', options.directory, '--format', options.format];
        if (options.force) args.push('--force');
        return this.runCliCommand(args);
    }
}
