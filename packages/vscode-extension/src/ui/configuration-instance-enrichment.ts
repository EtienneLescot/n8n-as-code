export type InstanceStatusResponse = {
  status: string;
  ready?: boolean;
  instance?: { ownerCredentialsAvailable?: boolean };
  blocked?: { code?: string; message?: string };
  warnings?: string[];
};

export type InstanceAccessResponse = {
  authUrl?: string;
  publicN8nUrl?: string;
  publicUrlEnabled?: boolean;
  apiBaseUrl?: string;
  warnings?: string[];
  tunnel?: { running?: boolean };
};

export type InstanceEnrichmentFacade = {
  status(input: { instanceId: string }): Promise<InstanceStatusResponse>;
  resolveInstanceAccess(input: { instanceId: string; mode: 'observe' }): Promise<InstanceAccessResponse>;
};

type InstanceEnrichmentCacheEntry = {
  signature: string;
  expiresAt: number;
  value: Record<string, unknown>;
};

type PendingInstanceEnrichment = {
  signature: string;
  promise: Promise<Record<string, unknown>>;
};

export const INSTANCE_ENRICHMENT_CACHE_TTL_MS = 5_000;
const INSTANCE_ENRICHMENT_ERROR_CACHE_TTL_MS = 1_000;
const INSTANCE_ENRICHMENT_FACADE_TIMEOUT_MS = 10_000;
const MAX_CACHE_ENTRIES = 100;

export class ConfigurationInstanceEnrichmentCache {
  private readonly entries = new Map<string, InstanceEnrichmentCacheEntry>();
  private readonly pending = new Map<string, PendingInstanceEnrichment>();

  constructor(
    private readonly ttlMs = INSTANCE_ENRICHMENT_CACHE_TTL_MS,
    private readonly facadeTimeoutMs = INSTANCE_ENRICHMENT_FACADE_TIMEOUT_MS,
  ) {}

  async enrich(instance: any, instanceFacade: InstanceEnrichmentFacade): Promise<Record<string, unknown>> {
    if (!instance?.id) {
      return this.buildUnavailableInstance(instance, 'Runtime status unavailable.');
    }

    const signature = this.getInstanceEnrichmentSignature(instance);
    const cached = this.entries.get(instance.id);
    if (cached && cached.signature === signature && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const pending = this.pending.get(instance.id);
    if (pending && pending.signature === signature) {
      return pending.promise;
    }

    let promise: Promise<Record<string, unknown>>;
    promise = this.readInstanceEnrichment(instance, instanceFacade)
      .then((result) => {
        const currentPending = this.pending.get(instance.id);
        if (currentPending?.promise === promise && currentPending.signature === signature && this.getInstanceEnrichmentSignature(instance) === signature) {
          this.setEntry(instance.id, {
            signature,
            value: result.value,
            expiresAt: Date.now() + result.cacheTtlMs,
          });
        }
        return result.value;
      })
      .finally(() => {
        const currentPending = this.pending.get(instance.id);
        if (currentPending?.promise === promise) {
          this.pending.delete(instance.id);
        }
      });
    this.pending.set(instance.id, { signature, promise });
    return promise;
  }

  invalidate(instanceId: string): void {
    this.entries.delete(instanceId);
    this.pending.delete(instanceId);
  }

  private async readInstanceEnrichment(instance: any, instanceFacade: InstanceEnrichmentFacade): Promise<{ value: Record<string, unknown>; cacheTtlMs: number }> {
    const safeInstance = instance || {};
    try {
      const runtime = await this.withTimeout(
        instanceFacade.status({ instanceId: safeInstance.id }),
        this.facadeTimeoutMs,
        'Runtime status',
      );
      const access = await this.withTimeout(
        instanceFacade.resolveInstanceAccess({
          instanceId: safeInstance.id,
          mode: 'observe',
        }),
        this.facadeTimeoutMs,
        'Instance access',
      );
      const accessWarnings = access.warnings || [];
      // Prefer auth/public URLs; while public tunneling is enabled but pending,
      // show no URL instead of a localhost API URL that cannot serve as public access.
      const displayUrl = access.authUrl || access.publicN8nUrl || (access.publicUrlEnabled ? '' : access.apiBaseUrl || '');
      return {
        cacheTtlMs: this.ttlMs,
        value: {
          ...safeInstance,
          host: displayUrl,
          displayUrl,
          authBridgePublicUrl: access.authUrl,
          verificationStatus: safeInstance.verification?.status || 'unverified',
          verificationLabel: this.getVerificationLabel(safeInstance),
          runtimeStatus: runtime.status,
          runtimeReady: 'ready' in runtime ? runtime.ready : runtime.status === 'ready',
          ownerCredentialsAvailable: Boolean(runtime.instance?.ownerCredentialsAvailable),
          runtimeBlockedCode: 'blocked' in runtime ? runtime.blocked?.code : undefined,
          runtimeBlockedMessage: 'blocked' in runtime ? runtime.blocked?.message : undefined,
          runtimeWarnings: accessWarnings.length ? accessWarnings : ('warnings' in runtime ? runtime.warnings : undefined),
          tunnelRunning: access.tunnel?.running,
          tunnelPublicUrl: access.publicN8nUrl || safeInstance.tunnelPublicUrl,
          access,
        },
      };
    } catch (error: any) {
      return {
        cacheTtlMs: Math.min(this.ttlMs, INSTANCE_ENRICHMENT_ERROR_CACHE_TTL_MS),
        value: this.buildUnavailableInstance(safeInstance, error?.message || 'Runtime status unavailable.'),
      };
    }
  }

  private buildUnavailableInstance(instance: any, message: string): Record<string, unknown> {
    const safeInstance = instance || {};
    return {
      ...safeInstance,
      host: safeInstance.tunnelPublicUrl || safeInstance.baseUrl || '',
      verificationStatus: safeInstance.verification?.status || 'unverified',
      verificationLabel: this.getVerificationLabel(safeInstance),
      runtimeStatus: 'unknown',
      runtimeReady: false,
      runtimeBlockedMessage: message,
    };
  }

  private getVerificationLabel(instance: any): string {
    return instance.verification?.status === 'verified'
      ? 'Verified'
      : instance.verification?.status === 'failed'
        ? 'Verification failed'
        : 'Not verified yet';
  }

  private getInstanceEnrichmentSignature(instance: any): string {
    return JSON.stringify({
      id: instance.id || '',
      mode: instance.mode || '',
      baseUrl: instance.baseUrl || '',
      tunnelPublicUrl: instance.tunnelPublicUrl || '',
      publicUrlEnabled: Boolean(instance.publicUrlEnabled),
      verificationStatus: instance.verification?.status || '',
      updatedAt: instance.updatedAt || '',
    });
  }

  private setEntry(instanceId: string, entry: InstanceEnrichmentCacheEntry): void {
    this.entries.set(instanceId, entry);
    this.evictExpiredEntries(Date.now());
    this.evictOverflowEntries();
  }

  private evictExpiredEntries(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private evictOverflowEntries(): void {
    while (this.entries.size > MAX_CACHE_ENTRIES) {
      let oldestKey: string | undefined;
      let oldestExpiresAt = Number.POSITIVE_INFINITY;
      for (const [key, entry] of this.entries) {
        if (entry.expiresAt < oldestExpiresAt) {
          oldestKey = key;
          oldestExpiresAt = entry.expiresAt;
        }
      }
      if (!oldestKey) return;
      this.entries.delete(oldestKey);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
