import crypto from 'crypto';

function createStableUserIdentitySlug(user: { id?: string; email?: string; firstName?: string; lastName?: string }): string | undefined {
    if (!user.id) {
        return undefined;
    }

    const identityHash = crypto.createHash('sha256').update(user.id).digest('hex').substring(0, 10);
    return `n8n_${identityHash}`;
}

/**
 * Creates an instance identifier for directory naming
 * @param user User information (optional)
 * @returns Instance identifier (e.g., "n8n_c6c289e49e")
 */
export function createInstanceIdentifier(user?: { id?: string; email?: string; firstName?: string; lastName?: string }): string {
    const stableUserIdentitySlug = user ? createStableUserIdentitySlug(user) : undefined;
    if (stableUserIdentitySlug) {
        return stableUserIdentitySlug;
    }

    throw new Error('Unable to create a stable instance identifier: n8n user ID is missing.');
}

export function isCanonicalUserInstanceIdentifier(identifier?: string): boolean {
    return Boolean(identifier && /^n8n_[a-f0-9]{10}$/.test(identifier));
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
