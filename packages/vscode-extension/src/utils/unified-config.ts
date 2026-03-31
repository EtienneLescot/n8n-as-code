import { randomUUID } from 'crypto';
import * as path from 'path';
import {
    ConfigService,
    resolveInstanceIdentifier,
    type IN8nCredentials,
    type IInstanceIdentifierClient,
    type ILocalConfig,
    type IInstanceProfile,
    type IWorkspaceConfig,
    type IInstanceVerificationClient,
} from 'n8nac';

export type UnifiedWorkspaceConfig = IWorkspaceConfig;

type BuildUnifiedWorkspaceConfigInput = {
    workspaceRoot: string;
    host: string;
    apiKey: string;
    syncFolder: string;
    projectId?: string;
    projectName?: string;
    instanceIdentifier?: string;
    instanceId?: string;
    instanceName?: string;
    createNew?: boolean;
    setActive?: boolean;
    client?: IInstanceVerificationClient & IInstanceIdentifierClient;
};

export function getUnifiedConfigPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, 'n8nac-config.json');
}

export function readUnifiedWorkspaceConfig(workspaceRoot: string): UnifiedWorkspaceConfig {
    return new ConfigService(workspaceRoot).getWorkspaceConfig();
}

export function toStoredSyncFolder(workspaceRoot: string, syncFolder: string): string {
    if (!syncFolder) {
        return 'workflows';
    }

    return syncFolder.startsWith(workspaceRoot)
        ? path.relative(workspaceRoot, syncFolder) || 'workflows'
        : syncFolder;
}

function getCurrentInstance(
    existing: UnifiedWorkspaceConfig,
    instanceId?: string
): IInstanceProfile | undefined {
    const targetId = instanceId || existing.activeInstanceId;
    return targetId
        ? existing.instances.find((instance) => instance.id === targetId)
        : undefined;
}

function createDraftInstanceId(): string {
    return `instance-${randomUUID().slice(0, 8)}`;
}

function toActiveFields(active?: Partial<IInstanceProfile>): Partial<IWorkspaceConfig> {
    const next: Partial<IWorkspaceConfig> = {};
    const stringKeys: Array<keyof ILocalConfig> = [
        'host',
        'syncFolder',
        'projectId',
        'projectName',
        'instanceIdentifier',
        'customNodesPath',
    ];

    for (const key of stringKeys) {
        const value = active?.[key];
        if (typeof value === 'string' && value.trim() !== '') {
            next[key] = value as never;
        }
    }

    if (typeof active?.folderSync === 'boolean') {
        next.folderSync = active.folderSync;
    }

    return next;
}

export async function buildUnifiedWorkspaceConfig(
    input: BuildUnifiedWorkspaceConfigInput
): Promise<UnifiedWorkspaceConfig> {
    const existing = readUnifiedWorkspaceConfig(input.workspaceRoot);
    const current = input.createNew ? undefined : getCurrentInstance(existing, input.instanceId);
    const storedSyncFolder = toStoredSyncFolder(input.workspaceRoot, input.syncFolder || 'workflows');

    let resolvedInstanceIdentifier: string | undefined = input.instanceIdentifier;
    if (input.host && input.apiKey) {
        const credentials: IN8nCredentials = {
            host: input.host,
            apiKey: input.apiKey
        };
        const { identifier } = await resolveInstanceIdentifier(credentials, {
            client: input.client
        });
        resolvedInstanceIdentifier = identifier;
    } else if (input.apiKey !== '' || input.host !== '') {
        resolvedInstanceIdentifier = undefined;
    }

    const instanceId = current?.id || input.instanceId || createDraftInstanceId();
    const instanceName = input.instanceName?.trim() || current?.name || input.host || 'Default instance';
    const profile: IInstanceProfile = {
        id: instanceId,
        name: instanceName,
        host: input.host || undefined,
        syncFolder: storedSyncFolder || undefined,
        projectId: input.projectId || undefined,
        projectName: input.projectName || undefined,
        instanceIdentifier: resolvedInstanceIdentifier,
        customNodesPath: current?.customNodesPath,
        folderSync: current?.folderSync,
        verification: current?.verification,
    };

    const instances = [
        ...existing.instances.filter((instance) => instance.id !== profile.id),
        profile,
    ].sort((left, right) => left.name.localeCompare(right.name));

    const activeInstanceId = input.setActive === false
        ? (existing.activeInstanceId || profile.id)
        : profile.id;
    const active = instances.find((instance) => instance.id === activeInstanceId);

    return {
        version: 2,
        activeInstanceId,
        instances,
        ...toActiveFields(active),
    };
}

export async function writeUnifiedWorkspaceConfig(
    input: BuildUnifiedWorkspaceConfigInput
): Promise<UnifiedWorkspaceConfig> {
    const service = new ConfigService(input.workspaceRoot);
    const storedSyncFolder = toStoredSyncFolder(input.workspaceRoot, input.syncFolder || 'workflows');

    const result = await service.upsertInstanceConfigWithVerification({
        host: input.host || undefined,
        apiKey: input.apiKey || undefined,
        syncFolder: storedSyncFolder || undefined,
        projectId: input.projectId || undefined,
        projectName: input.projectName || undefined,
        instanceIdentifier: input.instanceIdentifier,
    }, {
        instanceId: input.instanceId,
        instanceName: input.instanceName,
        createNew: input.createNew,
        setActive: input.setActive,
        client: input.client,
    });

    if (result.status === 'duplicate') {
        throw new Error(`This n8n instance is already saved as "${result.duplicateInstance.name}".`);
    }

    return service.getWorkspaceConfig();
}
