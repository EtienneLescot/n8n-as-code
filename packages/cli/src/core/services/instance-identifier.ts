import { IN8nCredentials } from '../types.js';
import { N8nApiClient } from './n8n-api-client.js';
import { createInstanceIdentifier } from './directory-utils.js';

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
}

export interface IResolveInstanceIdentifierOptions {
    client?: IInstanceIdentifierClient;
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
