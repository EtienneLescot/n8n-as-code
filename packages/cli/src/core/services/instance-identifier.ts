import { IN8nCredentials } from '../types.js';
import { N8nApiClient } from './n8n-api-client.js';
import { createCanonicalInstanceIdentifier, createInstanceIdentifier, createInstanceUserIdentifier } from './directory-utils.js';

type IUserLike = {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
};

export interface IInstanceIdentifierClient {
    getCurrentUser(): Promise<IUserLike | null>;
    getInstanceIdentity?(): Promise<{ id?: string } | null>;
}

export interface IResolvedInstanceIdentifier {
    identifier: string;
}

export interface IResolvedN8nIdentity {
    instanceIdentifier: string;
    instanceUserIdentifier: string;
}

export interface IResolveInstanceIdentifierOptions {
    client?: IInstanceIdentifierClient;
    instanceSeed?: string;
}

export async function resolveN8nIdentity(
    credentials: IN8nCredentials,
    options: IResolveInstanceIdentifierOptions = {}
): Promise<IResolvedN8nIdentity> {
    const client = options.client ?? new N8nApiClient(credentials);

    const user = await client.getCurrentUser();

    if (!user?.id) {
        throw new Error('Unable to resolve the authenticated n8n user ID from the API key.');
    }

    const instanceIdentity = await client.getInstanceIdentity?.().catch(() => null);
    const instanceSeed = instanceIdentity?.id || options.instanceSeed || credentials.host;

    return {
        instanceIdentifier: createCanonicalInstanceIdentifier(instanceSeed),
        instanceUserIdentifier: createInstanceUserIdentifier(user),
    };
}

export async function resolveInstanceIdentifier(
    credentials: IN8nCredentials,
    options: IResolveInstanceIdentifierOptions = {}
): Promise<IResolvedInstanceIdentifier> {
    const client = options.client ?? new N8nApiClient(credentials);

    const user = await client.getCurrentUser();

    if (!user?.id) {
        throw new Error('Unable to resolve the authenticated n8n user ID from the API key.');
    }

    return {
        identifier: createInstanceIdentifier(user),
    };
}
