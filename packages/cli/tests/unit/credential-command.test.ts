import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialCommand } from '../../src/commands/credential.js';

vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const proxy: any = new Proxy(identity, {
        get: (_target, prop) => {
            if (prop === 'level') return 0;
            return proxy;
        },
        apply: (_target, _this, args) => args[0],
    });
    return { default: proxy };
});

function makeCommand(): CredentialCommand {
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';
    return new CredentialCommand();
}

describe('CredentialCommand remote error handling', () => {
    let cmd: CredentialCommand;
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
            throw new Error(`process.exit:${code ?? 0}`);
        }) as never);
        cmd = makeCommand();
    });

    it('prints a stable error and exits non-zero when listing credentials fails', async () => {
        vi.spyOn(cmd['client'], 'listCredentials').mockRejectedValue(new Error('401 Unauthorized'));

        await expect(cmd.list()).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith('❌ Failed to list credentials: 401 Unauthorized');
    });

    it('prints a stable error and exits non-zero when credential creation fails', async () => {
        vi.spyOn(cmd['client'], 'createCredential').mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(
            cmd.create({
                type: 'slackApi',
                name: 'Slack Prod',
                data: '{"accessToken":"secret"}',
            }),
        ).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith('❌ Failed to create credential "Slack Prod": ECONNREFUSED');
    });

    it('surfaces backend validation details instead of a bare status code', async () => {
        vi.spyOn(cmd['client'], 'createCredential').mockRejectedValue({
            response: {
                status: 400,
                data: { message: 'request.body.data requires property "headerName"' },
            },
            message: 'Request failed with status code 400',
        });

        await expect(
            cmd.create({
                type: 'openAiApi',
                name: 'OpenAI',
                data: '{"apiKey":"secret"}',
            }),
        ).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith(
            '❌ Failed to create credential "OpenAI": HTTP 400: request.body.data requires property "headerName"',
        );
    });

    it('retries credential creation with inferred boolean defaults from the schema', async () => {
        vi.spyOn(cmd['client'], 'createCredential')
            .mockRejectedValueOnce({
                response: {
                    status: 400,
                    data: { message: 'request.body.data requires property "headerName"' },
                },
                message: 'Request failed with status code 400',
            })
            .mockResolvedValueOnce({ id: 'cred-1', name: 'OpenAI', type: 'openAiApi' });
        vi.spyOn(cmd['client'], 'getCredentialSchema').mockResolvedValue({
            properties: {
                apiKey: { type: 'string' },
                header: { type: 'boolean' },
            },
            allOf: [
                {
                    if: {
                        properties: {
                            header: {
                                enum: [true],
                            },
                        },
                    },
                },
            ],
        } as any);

        await cmd.create({
            type: 'openAiApi',
            name: 'OpenAI',
            data: '{"apiKey":"secret"}',
        });

        expect(cmd['client'].createCredential).toHaveBeenNthCalledWith(1, {
            type: 'openAiApi',
            name: 'OpenAI',
            data: { apiKey: 'secret' },
        });
        expect(cmd['client'].createCredential).toHaveBeenNthCalledWith(2, {
            type: 'openAiApi',
            name: 'OpenAI',
            data: { apiKey: 'secret', header: false },
        });
        expect(logSpy).toHaveBeenCalledWith(
            'ℹ Applied schema defaults before retrying credential creation: header=false',
        );
        expect(logSpy).toHaveBeenCalledWith('✅ Credential "OpenAI" created (ID: cred-1)');
    });

    it('supports JSON output for credential creation', async () => {
        vi.spyOn(cmd['client'], 'createCredential').mockResolvedValue({
            id: 'cred-1',
            name: 'OpenAI',
            type: 'openAiApi',
        });

        await cmd.create({
            type: 'openAiApi',
            name: 'OpenAI',
            data: '{"apiKey":"secret"}',
            json: true,
        });

        expect(logSpy).toHaveBeenCalledWith(
            JSON.stringify({ id: 'cred-1', name: 'OpenAI', type: 'openAiApi' }, null, 2),
        );
    });

    it('supports JSON output for credential list', async () => {
        vi.spyOn(cmd['client'], 'listCredentials').mockResolvedValue([
            { id: 'cred-1', name: 'OpenAI', type: 'openAiApi' },
        ]);

        await cmd.list({ json: true });

        expect(logSpy).toHaveBeenCalledWith(
            JSON.stringify([{ id: 'cred-1', name: 'OpenAI', type: 'openAiApi' }], null, 2),
        );
    });

    it('rejects non-object inline credential payloads', async () => {
        await expect(
            cmd.create({
                type: 'openAiApi',
                name: 'OpenAI',
                data: '["secret"]',
            }),
        ).rejects.toThrow('process.exit:1');

        expect(errorSpy).toHaveBeenCalledWith('❌ --data must be a JSON object.');
    });

    it('rejects non-object file credential payloads', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'n8nac-cred-test-'));
        const filePath = join(dir, 'cred.json');
        writeFileSync(filePath, '"secret"');

        try {
            await expect(
                cmd.create({
                    type: 'openAiApi',
                    name: 'OpenAI',
                    file: filePath,
                }),
            ).rejects.toThrow('process.exit:1');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }

        expect(errorSpy).toHaveBeenCalledWith(`❌ JSON in ${filePath} must be a JSON object.`);
    });
});
