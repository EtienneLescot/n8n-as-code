import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowCommand } from '../../src/commands/workflow.js';

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

function makeCommand(): WorkflowCommand {
    process.env.N8N_HOST = 'https://n8n.test';
    process.env.N8N_API_KEY = 'test-key';
    return new WorkflowCommand();
}

describe('WorkflowCommand.credentialRequired()', () => {
    let cmd: WorkflowCommand;
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

    it('matches existing credentials by type+name and falls back to id for unnamed references', async () => {
        vi.spyOn(cmd['client'], 'getWorkflow').mockResolvedValue({
            nodes: [
                {
                    name: 'Slack Sender',
                    credentials: {
                        slackApi: { name: 'Slack Prod' },
                    },
                },
                {
                    name: 'Jira Sync',
                    credentials: {
                        jiraSoftwareCloudApi: { id: 'cred-2' },
                    },
                },
            ],
        } as any);
        vi.spyOn(cmd['client'], 'listCredentials').mockResolvedValue([
            { id: 'cred-1', name: 'Slack Prod', type: 'slackApi' },
            { id: 'cred-2', name: 'Different Name', type: 'notUsedForLookup' },
        ]);

        await expect(cmd.credentialRequired('wf-1', { json: true })).rejects.toThrow('process.exit:0');

        const jsonOutput = logSpy.mock.calls[0]?.[0];
        expect(jsonOutput).toBeDefined();
        expect(JSON.parse(jsonOutput as string)).toEqual([
            {
                nodeName: 'Slack Sender',
                credentialType: 'slackApi',
                credentialName: 'Slack Prod',
                credentialId: undefined,
                exists: true,
            },
            {
                nodeName: 'Jira Sync',
                credentialType: 'jiraSoftwareCloudApi',
                credentialName: '',
                credentialId: 'cred-2',
                exists: true,
            },
        ]);
    });

    it('does not treat same-name credentials of another type as present', async () => {
        vi.spyOn(cmd['client'], 'getWorkflow').mockResolvedValue({
            nodes: [
                {
                    name: 'Slack Sender',
                    credentials: {
                        slackApi: { name: 'Shared Name' },
                    },
                },
            ],
        } as any);
        vi.spyOn(cmd['client'], 'listCredentials').mockResolvedValue([
            { id: 'cred-1', name: 'Shared Name', type: 'jiraSoftwareCloudApi' },
        ]);

        await expect(cmd.credentialRequired('wf-1', { json: true })).rejects.toThrow('process.exit:1');

        const parsed = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
        expect(parsed[0]).toMatchObject({
            credentialType: 'slackApi',
            credentialName: 'Shared Name',
            exists: false,
        });
    });

    it('exits with a clear error when remote inspection fails', async () => {
        vi.spyOn(cmd['client'], 'getWorkflow').mockRejectedValue(new Error('Network down'));

        await expect(cmd.credentialRequired('wf-1', { json: true })).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith('❌ Failed to inspect workflow wf-1: Network down');
    });
});

describe('WorkflowCommand activation helpers', () => {
    let cmd: WorkflowCommand;
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

    it('confirms activate only when the returned workflow is active', async () => {
        vi.spyOn(cmd['client'], 'activateWorkflow').mockResolvedValue({ id: 'wf-1', active: true } as any);

        await cmd.activate('wf-1');

        expect(logSpy).toHaveBeenCalledWith('✅ Workflow wf-1 activated.');
    });

    it('fails activate when n8n does not report the workflow as active', async () => {
        vi.spyOn(cmd['client'], 'activateWorkflow').mockResolvedValue({ id: 'wf-1', active: false } as any);

        await expect(cmd.activate('wf-1')).rejects.toThrow('process.exit:1');
        expect(errorSpy).toHaveBeenCalledWith(
            '❌ Workflow wf-1 did not report active=true after activation request',
        );
    });
});
