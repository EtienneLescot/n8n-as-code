import { IN8nCredentials } from '../types.js';
import { N8nApiClient } from './n8n-api-client.js';
import { createApiKeyInstanceIdentifier, createInstanceIdentifier } from './directory-utils.js';

type IUserLike = {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
};

export interface IInstanceIdentifierClient {
    getCurrentUser(): Promise<IUserLike | null>;
}

export interface IResolvedInstanceIdentifier {
    identifier: string;
    source: 'user' | 'apiKey';
    usedFallback: boolean;
}

export interface IResolveInstanceIdentifierOptions {
    client?: IInstanceIdentifierClient;
    throwOnConnectionError?: boolean;
}

function isConnectionError(error: any): boolean {
    return !error?.response ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ETIMEDOUT';
}

export async function resolveInstanceIdentifier(
    credentials: IN8nCredentials,
    options: IResolveInstanceIdentifierOptions = {}
): Promise<IResolvedInstanceIdentifier> {
    const client = options.client ?? new N8nApiClient(credentials);

    let user: IUserLike | null;
    try {
        user = await client.getCurrentUser();
    } catch (error) {
        if (options.throwOnConnectionError && isConnectionError(error)) {
            throw error;
        }
        return {
            identifier: createApiKeyInstanceIdentifier(credentials.apiKey),
            source: 'apiKey',
            usedFallback: true,
        };
    }

    if (!user?.id) {
        return {
            identifier: createApiKeyInstanceIdentifier(credentials.apiKey),
            source: 'apiKey',
            usedFallback: true,
        };
    }

    return {
        identifier: createInstanceIdentifier(credentials.host, user),
        source: 'user',
        usedFallback: false,
    };
}
