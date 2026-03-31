import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { SwitchCommand } from '../../src/commands/switch.js';

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

vi.mock('inquirer', () => ({
    default: {
        prompt: vi.fn(),
    },
}));

describe('SwitchCommand instance management', () => {
    let command: SwitchCommand;
    let configService: {
        listInstances: ReturnType<typeof vi.fn>;
        getCurrentInstanceConfigId: ReturnType<typeof vi.fn>;
        selectInstanceConfigWithVerification: ReturnType<typeof vi.fn>;
        deleteInstanceConfig: ReturnType<typeof vi.fn>;
    };
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        command = new SwitchCommand(new Command());
        configService = {
            listInstances: vi.fn(),
            getCurrentInstanceConfigId: vi.fn(),
            selectInstanceConfigWithVerification: vi.fn(),
            deleteInstanceConfig: vi.fn(),
        };
        (command as any).configService = configService;
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('selects a saved instance non-interactively by name', async () => {
        configService.listInstances.mockReturnValue([
            { id: 'prod', name: 'Production', host: 'https://prod.example.com', projectName: 'Personal' },
            { id: 'test', name: 'Test', host: 'https://test.example.com', projectName: 'Sandbox' },
        ]);
        configService.getCurrentInstanceConfigId.mockReturnValue('test');
        configService.selectInstanceConfigWithVerification.mockResolvedValue({
            status: 'selected',
            profile: { id: 'prod', name: 'Production', host: 'https://prod.example.com', projectName: 'Personal' },
            verificationStatus: 'verified',
        });

        await command.runInstanceSwitch({ instanceName: 'Production' });

        expect(configService.selectInstanceConfigWithVerification).toHaveBeenCalledWith('prod');
        expect(logSpy).toHaveBeenCalledWith('\n✔ Selected instance: Production');
    });

    it('deletes a saved instance non-interactively by id', async () => {
        configService.listInstances.mockReturnValue([
            { id: 'prod', name: 'Production', host: 'https://prod.example.com', projectName: 'Personal' },
            { id: 'test', name: 'Test', host: 'https://test.example.com', projectName: 'Sandbox' },
        ]);
        configService.getCurrentInstanceConfigId.mockReturnValue('prod');
        configService.deleteInstanceConfig.mockReturnValue({
            deletedInstance: { id: 'prod', name: 'Production' },
            activeInstance: { id: 'test', name: 'Test', projectName: 'Sandbox' },
        });

        await command.runInstanceDeletion({ instanceId: 'prod', yes: true });

        expect(configService.deleteInstanceConfig).toHaveBeenCalledWith('prod');
        expect(logSpy).toHaveBeenCalledWith('\n✔ Deleted saved config: Production');
    });

    it('renders saved instance configs as JSON for scripts', async () => {
        configService.listInstances.mockReturnValue([
            { id: 'prod', name: 'Production', host: 'https://prod.example.com' },
            { id: 'test', name: 'Test', host: 'https://test.example.com' },
        ]);
        configService.getCurrentInstanceConfigId.mockReturnValue('test');

        await command.runInstanceList({ json: true });

        expect(logSpy).toHaveBeenCalledWith(JSON.stringify([
            { id: 'prod', name: 'Production', host: 'https://prod.example.com', active: false },
            { id: 'test', name: 'Test', host: 'https://test.example.com', active: true },
        ], null, 2));
    });
});
