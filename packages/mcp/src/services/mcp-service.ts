import { spawn } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { createRequire } from 'module';

export interface N8nAsCodeMcpServiceOptions {
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

export class N8nAsCodeMcpService {
    readonly cwd: string;

    constructor(options: N8nAsCodeMcpServiceOptions = {}) {
        this.cwd = options.cwd || process.cwd();
    }

    private getCliEntryPath(): string {
        const require = createRequire(import.meta.url);
        const cliPkg = require.resolve('n8nac/package.json');
        return join(dirname(cliPkg), 'dist', 'index.js');
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
        const parsed = result.parsedJson;
        const hasParseError =
            parsed !== null &&
            typeof parsed === 'object' &&
            'parseError' in (parsed as Record<string, unknown>);

        if (typeof parsed !== 'undefined' && !hasParseError) {
            return parsed;
        }

        if (!result.success) {
            throw new Error(result.stderr || result.stdout || `CLI command failed: ${args.join(' ')}`);
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
}
