import fs from 'node:fs';
import path from 'node:path';
import { InstanceMcpClient } from './instance-mcp-client.js';
import { parseNodeTypeDefinitions, type ParsedNodeSchemaSection } from './node-schema-defs-parser.js';

export interface SchemaOverlayOptions {
    endpoint: string;
    token?: string;
    timeoutMs?: number;
    /** Directory that holds the overlay cache file (per environment). */
    cacheDir: string;
    /** Default time-to-live for fetched definitions. */
    ttlMs?: number;
    /** Test seam. */
    client?: InstanceMcpClient;
}

export interface SchemaDescriptor {
    type: string;
    version: string;
    resource?: string;
    operation?: string;
}

export interface OverlayNodeVersion {
    fetchedAtMs: number;
    properties: any[];
    /** Numeric typeVersion, for `@version` scoping at materialisation time. */
    version: number;
    resource?: string;
    operation?: string;
}

interface OverlayFile {
    schemaVersion: 1;
    ttlMs: number;
    nodes: Record<string, { type: string; name: string; version: number[]; versions: Record<string, OverlayNodeVersion> }>;
}

/** Cache/record key covering the full descriptor identity (NOT just type@version). */
function descriptorKey(d: { version: string; resource?: string; operation?: string }): string {
    return [d.version, d.resource ?? '', d.operation ?? ''].join('|');
}

function descriptorLabel(d: SchemaDescriptor): string {
    return `${d.type}@${d.version}` + (d.resource ? `/${d.resource}` : '') + (d.operation ? `:${d.operation}` : '');
}

const OVERLAY_FILENAME = '.schema-overlay.json';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The instance expects discriminator values in snake_case (getAll → get_all). */
function operationDiscriminator(operation: string): string {
    if (!/[a-z0-9][A-Z]/.test(operation)) return operation;
    return operation
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}

/**
 * Level-1 schema overlay: caches per-environment node definitions fetched from
 * the instance's native MCP `get_node_types` (the instance's exact schema) and
 * materialises them into a custom-nodes-style sidecar the bundled
 * `NodeSchemaProvider` merges over the built-in technical index.
 *
 * Sync is economical by construction: definitions are fetched lazily per
 * (node type, typeVersion) on first contact, refreshed only after the TTL, and
 * the resulting overlay file is written back so validation runs fully locally
 * between syncs — no MCP call per push.
 */
export class SchemaOverlayManager {
    private readonly options: Required<Pick<SchemaOverlayOptions, 'cacheDir'>> & SchemaOverlayOptions;
    private readonly overlayPath: string;
    private readonly ttlMs: number;

    constructor(options: SchemaOverlayOptions) {
        this.options = options;
        this.overlayPath = path.join(options.cacheDir, OVERLAY_FILENAME);
        this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    }

    get filePath(): string {
        return this.overlayPath;
    }

    private readCache(): OverlayFile {
        try {
            const raw = JSON.parse(fs.readFileSync(this.overlayPath, 'utf8')) as OverlayFile;
            if (raw.schemaVersion === 1 && raw.nodes && typeof raw.nodes === 'object') {
                // Drop legacy version records keyed by bare version (no
                // discriminator axes); they are re-fetched on demand.
                for (const entry of Object.values(raw.nodes)) {
                    for (const key of Object.keys(entry.versions ?? {})) {
                        if (!key.includes('|')) delete entry.versions[key];
                    }
                }
                return raw;
            }
        } catch {
            // missing or corrupt cache — start fresh
        }
        return { schemaVersion: 1, ttlMs: this.ttlMs, nodes: {} };
    }

    private writeCache(cache: OverlayFile): void {
        fs.mkdirSync(this.options.cacheDir, { recursive: true });
        const tmp = `${this.overlayPath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 1), 'utf8');
        fs.renameSync(tmp, this.overlayPath);
    }

    /** Node types used by a workflow, in the shape `get_node_types` expects. */
    static collectNodeTypes(workflow: any): Array<SchemaDescriptor> {
        const nodes: any[] = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
        const seen = new Set<string>();
        const out: Array<SchemaDescriptor> = [];
        for (const node of nodes) {
            const type = typeof node?.type === 'string' ? node.type : '';
            if (!type) continue;
            const descriptor: SchemaDescriptor = { type, version: String(node?.typeVersion ?? 1) };
            const params = node?.parameters ?? {};
            // get_node_types needs the resource/operation discriminators for
            // resource-scoped nodes (gmailTool, googleCalendarTool, ...).
            if (typeof params.resource === 'string' && !params.resource.includes('{{')) descriptor.resource = params.resource;
            if (typeof params.operation === 'string' && !params.operation.includes('{{')) descriptor.operation = operationDiscriminator(params.operation);
            // Dedupe on the FULL identity: same type@version with different
            // discriminators are different schemas and must all be fetched.
            const key = `${type}@${descriptorKey(descriptor)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(descriptor);
        }
        return out;
    }

    /** Whether every listed descriptor identity is cached and fresh. */
    isFresh(types: Array<SchemaDescriptor>): boolean {
        const cache = this.readCache();
        const now = Date.now();
        return types.every((d) => {
            const entry = cache.nodes[d.type]?.versions[descriptorKey(d)];
            return Boolean(entry) && now - entry.fetchedAtMs < this.ttlMs;
        });
    }

    /**
     * Ensure the overlay covers the given descriptors, fetching only what is
     * missing or expired. Returns the overlay file path plus the list of
     * requested descriptors the instance could not provide definitions for
     * (they then fall back to the bundled schema — partial coverage is kept).
     */
    async ensureForTypes(types: Array<SchemaDescriptor>): Promise<{ overlayPath: string; failed: string[] }> {
        const cache = this.readCache();
        const now = Date.now();
        const missing = types.filter((d) => {
            const entry = cache.nodes[d.type]?.versions[descriptorKey(d)];
            return !entry || now - entry.fetchedAtMs >= this.ttlMs;
        });

        const failed: string[] = [];
        if (missing.length > 0) {
            const byIdentity = new Map<string, SchemaDescriptor>();
            for (const descriptor of missing) byIdentity.set(`${descriptor.type}@${descriptorKey(descriptor)}`, descriptor);

            // One batched call first (the server omits, rather than errors on,
            // types it cannot describe without discriminators), then an
            // individual retry per still-missing descriptor with its discriminators.
            const sections = await this.fetchDefinitions([...byIdentity.values()]);
            const covered = new Set<string>();
            this.mergeSections(sections, [...byIdentity.values()], covered);

            for (const descriptor of byIdentity.values()) {
                if (covered.has(`${descriptor.type}@${descriptorKey(descriptor)}`)) continue;
                try {
                    const retry = await this.fetchDefinitions([descriptor]);
                    const retryCovered = new Set<string>();
                    this.mergeSections(retry, [descriptor], retryCovered);
                    if (!retryCovered.has(`${descriptor.type}@${descriptorKey(descriptor)}`)) {
                        failed.push(descriptorLabel(descriptor));
                    }
                } catch {
                    failed.push(descriptorLabel(descriptor));
                }
            }
        }

        return { overlayPath: this.overlayPath, failed };
    }

    private async fetchDefinitions(types: Array<SchemaDescriptor>): Promise<ParsedNodeSchemaSection[]> {
        const client = this.options.client ?? new InstanceMcpClient({
            endpoint: this.options.endpoint,
            token: this.options.token,
            timeoutMs: this.options.timeoutMs ?? 15000,
        });
        const nodeIds = types.map(({ type, version, resource, operation }) => {
            const descriptor: Record<string, string> = { nodeId: type, version };
            if (resource) descriptor.resource = resource;
            if (operation) descriptor.operation = operation;
            return descriptor;
        });
        const result = (await client.callTool('get_node_types', {
            nodeIds,
        })) as { structuredContent?: { definitions?: string }; content?: Array<{ type?: string; text?: string }> };

        let definitions = result?.structuredContent?.definitions;
        if (!definitions && Array.isArray(result?.content)) {
            definitions = result.content.find((c) => c?.type === 'text' && c?.text)?.text;
        }
        if (!definitions) {
            throw new Error('get_node_types returned no definitions');
        }
        return parseNodeTypeDefinitions(definitions);
    }

    /**
     * Match a fetched section to a requested descriptor. Type must match, the
     * version must be within tolerance, and discriminators must be compatible:
     * an explicit requested discriminator matches a generic (undiscriminated)
     * section or the exact same value — never a different one.
     */
    private findSection(
        sections: ParsedNodeSchemaSection[],
        descriptor: SchemaDescriptor,
    ): ParsedNodeSchemaSection | undefined {
        const wantedVersion = Number(descriptor.version);
        const byType = sections.filter((s) => s.type === descriptor.type);
        if (byType.length === 0) return undefined;

        const rank = (s: ParsedNodeSchemaSection): number => {
            if (Math.abs(s.version - wantedVersion) >= 0.01) return -1;
            let score = 0;
            for (const axis of ['resource', 'operation'] as const) {
                const want = descriptor[axis];
                const got = s[axis];
                if (want === undefined) {
                    score += got === undefined ? 2 : 1;
                } else if (got === undefined) {
                    score += 1;
                } else if (got === want) {
                    score += 2;
                } else {
                    return -1;
                }
            }
            return score;
        };

        let best: ParsedNodeSchemaSection | undefined;
        let bestScore = -1;
        for (const s of byType) {
            const score = rank(s);
            if (score > bestScore) {
                best = s;
                bestScore = score;
            }
        }
        // Preserve the historical leniency: a lone same-type section is used
        // even when nothing scores (e.g. version drift in either direction).
        if (!best && byType.length === 1) return byType[0];
        return bestScore >= 0 ? best : undefined;
    }

    private mergeSections(sections: ParsedNodeSchemaSection[], requested: Array<SchemaDescriptor>, covered: Set<string>): void {
        const cache = this.readCache();
        const now = Date.now();

        for (const requestedType of requested) {
            const section = this.findSection(sections, requestedType);
            if (!section) continue; // caller tracks coverage and retries individually

            const wantedVersion = Number(requestedType.version);
            const key = descriptorKey(requestedType);
            const typeKey = section.type;
            const entry = cache.nodes[typeKey] ?? { type: typeKey, name: typeKey.slice(typeKey.lastIndexOf('.') + 1), version: [], versions: {} };
            if (!entry.version.includes(wantedVersion)) {
                entry.version.push(wantedVersion);
            }
            entry.versions[key] = {
                fetchedAtMs: now,
                properties: section.properties,
                version: wantedVersion,
                ...(requestedType.resource ? { resource: requestedType.resource } : {}),
                ...(requestedType.operation ? { operation: requestedType.operation } : {}),
            };
            cache.nodes[typeKey] = entry;
            covered.add(`${requestedType.type}@${key}`);
        }

        this.writeCache(cache);
        this.materialiseProviderFile(cache);
    }

    /**
     * Write the custom-nodes sidecar consumed by `NodeSchemaProvider`: one node
     * entry per type with all cached schema records merged into
     * `schema.properties`. Records are scoped with display conditions only on
     * the axes that actually vary within the type, so single-record types keep
     * their properties exactly as parsed:
     * - several numeric versions → `@version` scoping (the validator then only
     *   applies the rules of the node's own typeVersion);
     * - several discriminator combos for one version → `resource`/`operation`
     *   scoping (same convention as the bundled index: the validator picks the
     *   variant whose conditions the node's own parameters satisfy).
     */
    private materialiseProviderFile(cache: OverlayFile): void {
        const nodes: Record<string, any> = {};
        for (const [typeKey, entry] of Object.entries(cache.nodes)) {
            const records = Object.values(entry.versions);
            const versionList = [...new Set(records.map((r) => r.version))].sort((a, b) => a - b);
            const resources = new Set(records.map((r) => r.resource ?? '').filter(Boolean));
            const operations = new Set(records.map((r) => r.operation ?? '').filter(Boolean));
            const scopeVersion = versionList.length > 1;
            const scopeResource = resources.size > 1;
            const scopeOperation = operations.size > 1;

            let properties: any[] = [];
            for (const record of records) {
                const recordProps = record.properties ?? [];
                if (!scopeVersion && !scopeResource && !scopeOperation) {
                    properties = properties.concat(recordProps);
                    continue;
                }
                for (const prop of recordProps) {
                    const show: Record<string, unknown[]> = { ...(prop.displayOptions?.show ?? {}) };
                    if (scopeVersion) show['@version'] = [record.version];
                    if (scopeResource && record.resource !== undefined) show.resource = [record.resource];
                    if (scopeOperation && record.operation !== undefined) show.operation = [record.operation];
                    const scoped = {
                        ...prop,
                        displayOptions: {
                            show,
                            ...(prop.displayOptions?.hide ? { hide: prop.displayOptions.hide } : {}),
                        },
                    };
                    properties.push(scoped);
                }
            }
            nodes[typeKey] = {
                name: entry.name,
                type: typeKey,
                displayName: entry.name,
                description: `Instance schema overlay for ${typeKey}`,
                version: versionList,
                schema: { properties },
                metadata: { keywords: [], operations: [], useCases: [], keywordScore: 0, hasDocumentation: false, markdownUrl: null, markdownFile: null },
            };
        }

        fs.mkdirSync(path.dirname(this.overlayPath), { recursive: true });
        const tmp = `${this.overlayPath}.provider.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ nodes }, null, 1), 'utf8');
        fs.renameSync(tmp, `${this.overlayPath}.provider.json`);
    }

    /** Path of the materialised provider sidecar (merged over the bundled index). */
    get providerFilePath(): string {
        return `${this.overlayPath}.provider.json`;
    }
}
