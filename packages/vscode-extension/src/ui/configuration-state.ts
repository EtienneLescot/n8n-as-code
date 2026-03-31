import type { IInstanceProfile } from 'n8nac';

export type UiInstance = {
    id: string;
    name: string;
    host: string;
    apiKey: string;
    syncFolder: string;
    projectId: string;
    projectName: string;
};

export type UiConfig = {
    instanceId: string;
    instanceName: string;
    host: string;
    apiKey: string;
    projectId: string;
    projectName: string;
    syncFolder: string;
};

export type ConfigurationInitState = {
    config: UiConfig;
    instances: UiInstance[];
    activeInstanceId: string;
    activeInstanceName: string;
};

type ResolvedConfigLike = {
    activeInstanceId?: string;
    activeInstanceName?: string;
    host: string;
    apiKey: string;
    projectId: string;
    projectName: string;
    syncFolder: string;
};

type BuildConfigurationInitStateInput = {
    workspaceConfig: {
        activeInstanceId?: string;
        instances: IInstanceProfile[];
    };
    activeInstance?: IInstanceProfile;
    resolved: ResolvedConfigLike;
    getApiKey: (host: string, instanceId?: string) => string | undefined;
    normalizeHost: (host: string) => string;
};

export function buildConfigurationInitState(
    input: BuildConfigurationInitStateInput
): ConfigurationInitState {
    const { workspaceConfig, activeInstance, resolved, getApiKey, normalizeHost } = input;

    const instances: UiInstance[] = workspaceConfig.instances.map((instance) => ({
        id: instance.id,
        name: instance.name,
        host: normalizeHost(instance.host || ''),
        apiKey: instance.host ? (getApiKey(instance.host, instance.id) || '') : '',
        syncFolder: instance.syncFolder || 'workflows',
        projectId: instance.projectId || '',
        projectName: instance.projectName || '',
    }));

    const activeHost = activeInstance?.host || resolved.host;
    const activeInstanceId = activeInstance?.id || resolved.activeInstanceId || '';
    const activeInstanceName = activeInstance?.name || resolved.activeInstanceName || '';
    const activeApiKey = activeInstance?.host
        ? (getApiKey(activeInstance.host, activeInstance.id) || '')
        : resolved.apiKey;

    return {
        config: {
            instanceId: activeInstanceId,
            instanceName: activeInstanceName,
            host: normalizeHost(activeHost),
            apiKey: activeApiKey.trim(),
            projectId: activeInstance?.projectId || resolved.projectId,
            projectName: activeInstance?.projectName || resolved.projectName,
            syncFolder: activeInstance?.syncFolder || resolved.syncFolder,
        },
        instances,
        activeInstanceId,
        activeInstanceName,
    };
}
