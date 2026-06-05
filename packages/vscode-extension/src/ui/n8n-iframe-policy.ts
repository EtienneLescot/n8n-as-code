export const N8N_IFRAME_SANDBOX = [
    'allow-same-origin',
    'allow-scripts',
    'allow-forms',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-modals',
    'allow-downloads',
    'allow-top-navigation-by-user-activation',
].join(' ');

export function getN8nIframePermissionOrigin(url?: string): string {
    try {
        return url ? new URL(url).origin : 'src';
    } catch {
        return 'src';
    }
}

export function buildN8nIframeAllowPolicy(url?: string): string {
    const origin = getN8nIframePermissionOrigin(url);
    return `clipboard-read ${origin}; clipboard-write ${origin}; geolocation ${origin}; microphone ${origin}; camera ${origin}`;
}
