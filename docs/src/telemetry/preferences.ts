/**
 * Shared telemetry preferences for the documentation site.
 *
 * Both the client module that sends events and the toggle rendered on the
 * telemetry page read through here, so there is one definition of what
 * "disabled" means rather than two that can drift apart.
 */

export const DISABLED_KEY = 'n8n-as-code:telemetry-disabled';
export const NOTICE_KEY = 'n8n-as-code:telemetry-notice-acknowledged';
export const ANONYMOUS_ID_KEY = 'n8n-as-code:docs-telemetry-id';

let cachedStorage: Storage | null | undefined;

/**
 * localStorage throws rather than returning null when site data is blocked
 * (Safari private browsing, "block all cookies", some enterprise policies),
 * so every access has to be probed before it is trusted.
 */
function getStorage(): Storage | null {
  if (cachedStorage !== undefined) return cachedStorage;

  try {
    const storage = window.localStorage;
    const probe = '__n8nac_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    cachedStorage = storage;
  } catch {
    cachedStorage = null;
  }

  return cachedStorage;
}

export function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && getStorage() !== null;
}

export function isDoNotTrack(): boolean {
  return typeof navigator !== 'undefined' && navigator.doNotTrack === '1';
}

export function readFlag(key: string): boolean {
  return getStorage()?.getItem(key) === '1';
}

export function writeFlag(key: string, value: boolean): void {
  const storage = getStorage();
  if (!storage) return;

  if (value) {
    storage.setItem(key, '1');
  } else {
    storage.removeItem(key);
  }
}

export function readValue(key: string): string | null {
  return getStorage()?.getItem(key) ?? null;
}

export function writeValue(key: string, value: string): void {
  getStorage()?.setItem(key, value);
}
