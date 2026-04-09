import crypto from 'crypto';

export function normalizeHostForIdentity(host: string): string {
    const trimmed = host.trim();
    if (!trimmed) {
        return '';
    }

    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

/**
 * Creates a user-friendly host slug for directory naming
 * @param host The host URL
 * @returns Cleaned host slug (e.g., "local_5678", "etiennel_cloud")
 */
export function createHostSlug(host: string): string {
    const isWindows = process.platform === 'win32';

    // Remove protocol and trailing slashes
    let cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Handle localhost with port
    if (cleanHost.startsWith('localhost:')) {
        const port = cleanHost.split(':')[1];
        return `local_${port}`;
    }

    if (isWindows) {
        cleanHost = cleanHost.replace(/:/g, '_');
    }
    
    // For domains, extract main parts
    // etiennel.app.n8n.cloud -> etiennel_cloud
    // prod.example.com -> prod_example
    cleanHost = cleanHost
        .replace(/\.app\.n8n\.cloud$/, '_cloud')
        .replace(/\.example\.com$/, '_example')
        .replace(/\.com$/, '')
        .replace(/\.io$/, '')
        .replace(/\.net$/, '')
        .replace(/\.org$/, '');
    
    // Replace remaining dots and hyphens with underscores
    return cleanHost
        .replace(/[.-]/g, '_')
        .toLowerCase();
}

/**
 * Creates a user-friendly slug from user information
 * @param user User object with id, email, firstName, lastName
 * @returns User slug (e.g., "etienne_l", "john_d", "user_123")
 */
export function createUserSlug(user: { id?: string; email?: string; firstName?: string; lastName?: string }): string {
    // Prefer first name + last name initial if available
    if (user.firstName && user.lastName) {
        return `${user.firstName.toLowerCase()}_${user.lastName.charAt(0).toLowerCase()}`;
    }
    
    // Fallback to first name only
    if (user.firstName) {
        return user.firstName.toLowerCase();
    }
    
    // Fallback to email username part
    if (user.email) {
        return user.email.split('@')[0]
            .replace(/[^a-zA-Z0-9]/g, '_')
            .toLowerCase();
    }

    // Fallback to normalized ID
    if (user.id) {
        return `user_${user.id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    }
    
    // Final fallback
    return 'user';
}

/**
 * Creates an instance identifier for directory naming
 * @param host The host URL
 * @param user User information (optional)
 * @returns Instance identifier (e.g., "local_5678_etienne_l")
 */
export function createInstanceIdentifier(host: string, user?: { id?: string; email?: string; firstName?: string; lastName?: string }): string {
    const hostSlug = createHostSlug(host);
    const userSlug = user ? createUserSlug(user) : 'user';
    
    return `${hostSlug}_${userSlug}`;
}

/**
 * Creates a fallback instance identifier using API key hash when user info is unavailable
 * @param host The host URL
 * @param apiKey The API key for uniqueness
 * @returns Fallback instance identifier (e.g., "local_5678_abc123")
 */
export function createFallbackInstanceIdentifier(host: string, apiKey: string): string {
    const hostSlug = createHostSlug(host);
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 6);
    
    return `${hostSlug}_${apiKeyHash}`;
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
