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

export interface OverlayNodeVersion {
    fetchedAtMs: number;
    properties: any[];
}

interface OverlayFile {
    schemaVersion: 1;
    ttlMs: number;
    nodes: Record<string, { type: string; name: string; version: number[]; versions: Record<string, OverlayNodeVersion> }>;
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
    static collectNodeTypes(workflow: any): Array<{ type: string; version: string; resource?: string; operation?: string }> {
        const nodes: any[] = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
        const seen = new Set<string>();
        const out: Array<{ type: string; version: string; resource?: string; operation?: string }> = [];
        for (const node of nodes) {
            const type = typeof node?.type === 'string' ? node.type : '';
            if (!type) continue;
            const key = `${type}@${node?.typeVersion ?? 1}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const params = node?.parameters ?? {};
            const descriptor: { type: string; version: string; resource?: string; operation?: string } = { type, version: String(node?.typeVersion ?? 1) };
            // get_node_types needs the resource/operation discriminators for
            // resource-scoped nodes (gmailTool, googleCalendarTool, ...).
            if (typeof params.resource === 'string' && !params.resource.includes('{{')) descriptor.resource = params.resource;
            if (typeof params.operation === 'string' && !params.operation.includes('{{')) descriptor.operation = operationDiscriminator(params.operation);
            out.push(descriptor);
        }
        return out;
    }

    /** Whether every listed (type, version) is cached and fresh. */
    isFresh(types: Array<{ type: string; version: string }>): boolean {
        const cache = this.readCache();
        const now = Date.now();
        return types.every(({ type, version }) => {
            const entry = cache.nodes[type]?.versions[version];
            return Boolean(entry) && now - entry.fetchedAtMs < this.ttlMs;
        });
    }

    /**
     * Ensure the overlay covers the given (type, version) pairs, fetching only
     * what is missing or expired. Returns the overlay file path plus the list of
     * requested types the instance could not provide definitions for (they then
     * fall back to the bundled schema — partial coverage is kept).
     */
    async ensureForTypes(types: Array<{ type: string; version: string; resource?: string; operation?: string }>): Promise<{ overlayPath: string; failed: string[] }> {
        const cache = this.readCache();
        const now = Date.now();
        const missing = types.filter(({ type, version }) => {
            const entry = cache.nodes[type]?.versions[version];
            return !entry || now - entry.fetchedAtMs >= this.ttlMs;
        });

        const failed: string[] = [];
        if (missing.length > 0) {
            const byType = new Map<string, { type: string; version: string; resource?: string; operation?: string }>();
            for (const descriptor of missing) byType.set(descriptor.type, descriptor);

            // One batched call first (the server omits, rather than errors on,
            // types it cannot describe without discriminators), then an
            // individual retry per still-missing type with its discriminators.
            const sections = await this.fetchDefinitions([...byType.values()]);
            const covered = new Set(sections.map((s) => s.type));
            this.mergeSections(sections, [...byType.values()]);

            for (const descriptor of byType.values()) {
                if (covered.has(descriptor.type)) continue;
                try {
                    const retry = await this.fetchDefinitions([descriptor]);
                    this.mergeSections(retry, [descriptor]);
                    if (retry.length === 0) failed.push(`${descriptor.type}@${descriptor.version}`);
                } catch {
                    failed.push(`${descriptor.type}@${descriptor.version}`);
                }
            }
        }

        return { overlayPath: this.overlayPath, failed };
    }

    private async fetchDefinitions(types: Array<{ type: string; version: string; resource?: string; operation?: string }>): Promise<ParsedNodeSchemaSection[]> {
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

    private mergeSections(sections: ParsedNodeSchemaSection[], requested: Array<{ type: string; version: string }>): void {
        const cache = this.readCache();
        const now = Date.now();

        for (const requestedType of requested) {
            const wantedVersion = Number(requestedType.version);
            const section = sections.find((s) => {
                if (s.type !== requestedType.type) return false;
                if (sections.filter((x) => x.type === requestedType.type).length === 1) return true;
                return Math.abs(s.version - wantedVersion) < 0.01;
            });
            if (!section) continue; // caller tracks coverage and retries individually

            const typeKey = section.type;
            const versionKey = String(wantedVersion);
            const entry = cache.nodes[typeKey] ?? { type: typeKey, name: typeKey.slice(typeKey.lastIndexOf('.') + 1), version: [], versions: {} };
            if (!entry.version.includes(wantedVersion)) {
                entry.version.push(wantedVersion);
            }
            entry.versions[versionKey] = { fetchedAtMs: now, properties: section.properties };
            cache.nodes[typeKey] = entry;
        }

        this.writeCache(cache);
        this.materialiseProviderFile(cache);
    }

    /**
     * Write the custom-nodes sidecar consumed by `NodeSchemaProvider`: one node
     * entry per type with all cached versions merged into `schema.properties`.
     * When several versions of a type are cached, every property is scoped with
     * an `@version` display condition so the validator only applies the rules of
     * the node's own typeVersion.
     */
    private materialiseProviderFile(cache: OverlayFile): void {
        const nodes: Record<string, any> = {};
        for (const [typeKey, entry] of Object.entries(cache.nodes)) {
            const versionList = [...entry.version].sort((a, b) => a - b);
            let properties: any[] = [];
            for (const version of versionList) {
                const versionProps = entry.versions[String(version)]?.properties ?? [];
                if (versionList.length === 1) {
                    properties = properties.concat(versionProps);
                    continue;
                }
                for (const prop of versionProps) {
                    const scoped = {
                        ...prop,
                        displayOptions: {
                            show: {
                                ...(prop.displayOptions?.show ?? {}),
                                '@version': [version],
                            },
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
