import crypto from 'crypto';

function createStableHashSlug(prefix: string, value?: string): string | undefined {
    const cleaned = value?.trim();
    if (!cleaned) {
        return undefined;
    }

    const identityHash = crypto.createHash('sha256').update(cleaned).digest('hex').substring(0, 10);
    return `${prefix}_${identityHash}`;
}

function createLegacyUserIdentitySlug(user: { id?: string; email?: string; firstName?: string; lastName?: string }): string | undefined {
    return createStableHashSlug('n8n', user.id);
}

/**
 * Creates a legacy user-scoped instance identifier for directory naming.
 * Prefer createInstanceUserIdentifier() for new v4 workflow directory identity.
 * @param user User information (optional)
 * @returns Instance identifier (e.g., "n8n_c6c289e49e")
 */
export function createInstanceIdentifier(user?: { id?: string; email?: string; firstName?: string; lastName?: string }): string {
    const stableUserIdentitySlug = user ? createLegacyUserIdentitySlug(user) : undefined;
    if (stableUserIdentitySlug) {
        return stableUserIdentitySlug;
    }

    throw new Error('Unable to create a stable instance identifier: n8n user ID is missing.');
}

export function createCanonicalInstanceIdentifier(instance: { id?: string } | string | undefined): string {
    const rawId = typeof instance === 'string' ? instance : instance?.id;
    const stableInstanceSlug = createStableHashSlug('inst', rawId);
    if (stableInstanceSlug) {
        return stableInstanceSlug;
    }

    throw new Error('Unable to create a stable instance identifier: n8n instance ID is missing.');
}

export function createInstanceUserIdentifier(user?: { id?: string; email?: string; firstName?: string; lastName?: string }): string {
    const stableUserIdentitySlug = user ? createStableHashSlug('user', user.id) : undefined;
    if (stableUserIdentitySlug) {
        return stableUserIdentitySlug;
    }

    throw new Error('Unable to create a stable instance user identifier: n8n user ID is missing.');
}

export function isCanonicalInstanceIdentifier(identifier?: string): boolean {
    return Boolean(identifier && /^inst_[a-f0-9]{10}$/.test(identifier));
}

export function isCanonicalInstanceUserIdentifier(identifier?: string): boolean {
    return Boolean(identifier && /^(?:user|n8n)_[a-f0-9]{10}$/.test(identifier));
}

export function isCanonicalUserInstanceIdentifier(identifier?: string): boolean {
    return isCanonicalInstanceUserIdentifier(identifier);
}

/**
 * Creates a project slug for directory naming
 * @param projectName The project name or type
 * @returns Project slug (e.g., "personal", "marketing_project")
 */
export function createProjectSlug(projectName: string): string {
    const slug = projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    return slug || 'project';
}
