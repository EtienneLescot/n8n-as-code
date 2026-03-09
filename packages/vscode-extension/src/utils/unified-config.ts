import * as fs from 'fs';
import * as path from 'path';
import {
    resolveInstanceIdentifier,
    type IN8nCredentials,
    type IInstanceIdentifierClient
} from 'n8nac';

export type UnifiedWorkspaceConfig = {
    host?: string;
    syncFolder?: string;
    projectId?: string;
    projectName?: string;
    instanceIdentifier?: string;
    [key: string]: unknown;
};

type BuildUnifiedWorkspaceConfigInput = {
    workspaceRoot: string;
    host: string;
    apiKey: string;
    syncFolder: string;
    projectId?: string;
    projectName?: string;
    instanceIdentifier?: string;
    client?: IInstanceIdentifierClient;
};

export function getUnifiedConfigPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, 'n8nac-config.json');
}

export function readUnifiedWorkspaceConfig(workspaceRoot: string): UnifiedWorkspaceConfig {
    const unifiedPath = getUnifiedConfigPath(workspaceRoot);

    try {
        if (fs.existsSync(unifiedPath)) {
            return JSON.parse(fs.readFileSync(unifiedPath, 'utf-8')) as UnifiedWorkspaceConfig;
        }
    } catch {
        // Ignore parse errors and rebuild from current settings.
    }

    return {};
}

export function toStoredSyncFolder(workspaceRoot: string, syncFolder: string): string {
    if (!syncFolder) {
        return 'workflows';
    }

    return syncFolder.startsWith(workspaceRoot)
        ? path.relative(workspaceRoot, syncFolder) || 'workflows'
        : syncFolder;
}

export async function buildUnifiedWorkspaceConfig(
    input: BuildUnifiedWorkspaceConfigInput
): Promise<UnifiedWorkspaceConfig> {
    const existing = readUnifiedWorkspaceConfig(input.workspaceRoot);
    const storedSyncFolder = toStoredSyncFolder(input.workspaceRoot, input.syncFolder || 'workflows');

    const unified: UnifiedWorkspaceConfig = {
        ...existing,
        host: input.host,
        syncFolder: storedSyncFolder,
        projectId: input.projectId || existing.projectId || '',
        projectName: input.projectName || existing.projectName || ''
    };

    if (input.instanceIdentifier) {
        unified.instanceIdentifier = input.instanceIdentifier;
        return unified;
    }

    if (input.host && input.apiKey) {
        const credentials: IN8nCredentials = {
            host: input.host,
            apiKey: input.apiKey
        };
        const { identifier } = await resolveInstanceIdentifier(credentials, {
            client: input.client
        });
        unified.instanceIdentifier = identifier;
        return unified;
    }

    delete unified.instanceIdentifier;
    return unified;
}

export async function writeUnifiedWorkspaceConfig(
    input: BuildUnifiedWorkspaceConfigInput
): Promise<UnifiedWorkspaceConfig> {
    const unified = await buildUnifiedWorkspaceConfig(input);
    fs.writeFileSync(getUnifiedConfigPath(input.workspaceRoot), JSON.stringify(unified, null, 2), 'utf-8');
    return unified;
}