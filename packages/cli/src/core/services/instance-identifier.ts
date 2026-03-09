import { IN8nCredentials } from '../types.js';
import { N8nApiClient } from './n8n-api-client.js';
import { createFallbackInstanceIdentifier, createInstanceIdentifier } from './directory-utils.js';

type IUserLike = {
    email?: string;
    firstName?: string;
    lastName?: string;
};

export interface IInstanceIdentifierClient {
    getCurrentUser(): Promise<IUserLike | null>;
}

export interface IResolvedInstanceIdentifier {
    identifier: string;
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

    try {
        const user = await client.getCurrentUser();
        if (user) {
            return {
                identifier: createInstanceIdentifier(credentials.host, user),
                usedFallback: false
            };
        }
    } catch (error) {
        if (options.throwOnConnectionError && isConnectionError(error)) {
            throw error;
        }
    }

    return {
        identifier: createFallbackInstanceIdentifier(credentials.host, credentials.apiKey),
        usedFallback: true
    };
}