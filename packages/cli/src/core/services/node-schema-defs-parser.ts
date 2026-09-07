/**
 * Parser for the TypeScript node-definition text that the instance's native
 * MCP `get_node_types` tool returns (one `interface <X>V<NN>Params` per node
 * typeVersion, with `@default` and `@displayOptions.show` JSDoc tags).
 *
 * It converts each top-level parameter declaration back into the property
 * shape the bundled technical index uses (`{ name, required, type, options,
 * default, displayOptions }`), so the parsed schema can feed the same
 * `WorkflowValidator` gating engine. Constructs that carry no validation
 * semantics (nested option bags, `IDataObject`, plain strings) degrade to
 * passthrough types rather than being dropped.
 */

export interface ParsedNodeSchemaProperty {
    name: string;
    required: boolean;
    type: string;
    options?: Array<{ name: string; value: string }>;
    default?: unknown;
    displayOptions?: { show?: Record<string, unknown[]>; hide?: Record<string, unknown[]> };
    description?: string;
}

export interface ParsedNodeSchemaSection {
    type: string;
    version: number;
    properties: ParsedNodeSchemaProperty[];
}

const PROPERTY_START = /^([A-Za-z_$][\w$]*)(\??)\s*:\s*(\S[\s\S]*)$/;

function countBraces(text: string): number {
    let depth = 0;
    for (const char of text) {
        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
    }
    return depth;
}

/** Extract `@tag value` content from a JSDoc block (raw lines without decoration). */
function jsDocTags(commentLines: string[]): { show?: string; default?: string; description?: string } {
    const text = commentLines.join('\n');
    const tags: { show?: string; default?: string; description?: string } = {};
    const show = text.match(/@displayOptions\.show\s*(\{[^\n]*\})/);
    if (show) tags.show = show[1];
    const def = text.match(/@default\s*(\S[^\n]*)$/m);
    if (def) tags.default = def[1].trim();
    const firstLine = commentLines
        .map((l) => l.trim().replace(/^\/\*+|\*+\/$|\*\//g, '').trim())
        .find(Boolean);
    if (firstLine) tags.description = firstLine;
    return tags;
}

function parseJsonish(raw: string | undefined): unknown {
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    try {
        return JSON.parse(trimmed);
    } catch {
        return trimmed;
    }
}

/** The generator emits JS-style objects (`{ sessionIdType: ["customKey"] }`) — quote the keys. */
function fixDisplayJson(raw: string): string {
    return raw
        .replace(/([{,]\s*)(\/?(?:[\w$-]+))(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"');
}

function parseDisplayOptions(raw: string | undefined): ParsedNodeSchemaProperty['displayOptions'] {
    if (!raw) return undefined;
    try {
        // The generator emits the SHOW object directly (`{ sessionIdType: ["customKey"] }`),
        // not the `{ show: ... }` wrapper — normalise both shapes defensively.
        const parsed = JSON.parse(fixDisplayJson(raw)) as Record<string, unknown>;
        const hasWrapper = typeof parsed.show === 'object' || typeof parsed.hide === 'object';
        const map = hasWrapper ? parsed : { show: parsed };
        const clean = (value: unknown) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
            const out: Record<string, unknown[]> = {};
            for (const [key, entry] of Object.entries(value)) {
                out[key] = Array.isArray(entry) ? entry : [entry];
            }
            return out;
        };
        return { show: clean(map.show), hide: clean(map.hide) };
    } catch {
        return undefined;
    }
}

/** Map a TS type expression to a validator property type + option values. */
function mapTypeExpression(typeText: string): { type: string; options?: Array<{ name: string; value: string }> } {
    let cleaned = typeText.replace(/Expression<[^>]*>/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/^\{[\s\S]*$/, (m) => m);

    if (/^Array\s*</.test(cleaned)) {
        return { type: cleaned.includes('{') ? 'fixedCollection' : 'multiOptions' };
    }
    if (cleaned.includes('__rl')) {
        return { type: 'resourceLocator' };
    }

    const segments = cleaned
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s && s !== 'null' && s !== 'undefined');

    if (segments.length > 0 && segments.every((s) => /^'[^']*'$/.test(s))) {
        const options = segments.map((s) => {
            const value = s.slice(1, -1);
            return { name: value, value };
        });
        return { type: 'options', options };
    }
    if (segments.includes('boolean')) return { type: 'boolean' };
    if (segments.includes('number')) return { type: 'number' };
    if (cleaned.includes('IDataObject')) return { type: 'json' };
    if (cleaned.startsWith('{')) return { type: 'object' };
    return { type: 'string' };
}

function toProperty(name: string, optional: boolean, typeText: string, tags: { show?: string; default?: string; description?: string }): ParsedNodeSchemaProperty {
    const { type, options } = mapTypeExpression(typeText);
    return {
        name,
        required: !optional,
        type,
        options,
        default: parseJsonish(tags.default),
        displayOptions: parseDisplayOptions(tags.show),
        description: tags.description,
    };
}

/**
 * Parse one `<Params>` interface body. Property declarations may span several
 * lines (nested object literals) and are documented by an optional preceding
 * JSDoc block. Stops at the interface's own closing brace.
 */
function parseParamsInterfaceBody(lines: string[]): ParsedNodeSchemaProperty[] {
    const properties: ParsedNodeSchemaProperty[] = [];
    let pendingComment: string[] = [];

    const takeComment = () => {
        const tags = jsDocTags(pendingComment);
        pendingComment = [];
        return tags;
    };

    let i = 0;
    while (i < lines.length) {
        const trimmed = lines[i].trim();

        if (trimmed.startsWith('/**') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            pendingComment.push(lines[i]);
            if (trimmed.includes('*/')) {
                const rest = trimmed.slice(trimmed.indexOf('*/') + 2).trim();
                if (rest && PROPERTY_START.test(rest)) {
                    // One-liner: `/** ... */ name?: type;`
                    const match = rest.match(PROPERTY_START)!;
                    const name = match[1];
                    const optional = match[2] === '?';
                    const { typeText, consumed, complete } = collectTypeText(match[3], lines, i + 1);
                    if (complete) {
                        properties.push(toProperty(name, optional, typeText, takeComment()));
                        i += consumed + 1;
                        continue;
                    }
                }
            }
            i += 1;
            continue;
        }

        if (!trimmed) {
            takeComment();
            i += 1;
            continue;
        }

        const match = trimmed.match(PROPERTY_START);
        if (match) {
            const name = match[1];
            const optional = match[2] === '?';
            const { typeText, consumed, complete } = collectTypeText(match[3], lines, i + 1);
            if (complete) {
                properties.push(toProperty(name, optional, typeText, takeComment()));
            }
            i += consumed + 1;
            continue;
        }

        takeComment();
        i += 1;
    }

    return properties;
}

/**
 * Reassemble a (possibly multiline) type expression starting from the text on
 * the declaration's first line, stopping at a ';' at brace depth zero.
 * Returns how many extra lines were consumed and whether a terminator was found.
 */
function collectTypeText(firstLineText: string, lines: string[], nextIndex: number): { typeText: string; consumed: number; complete: boolean } {
    let text = firstLineText;
    let depth = countBraces(text);
    let consumed = 0;

    while (true) {
        const semiIndex = depth <= 0 ? text.indexOf(';') : -1;
        if (semiIndex !== -1) {
            return { typeText: text.slice(0, semiIndex).trim(), consumed, complete: true };
        }
        if (nextIndex + consumed >= lines.length) {
            return { typeText: text.trim().replace(/;\s*$/, ''), consumed, complete: false };
        }
        const next = lines[nextIndex + consumed];
        text += ' ' + next;
        depth += countBraces(next);
        consumed += 1;
    }
}

/**
 * Parse the full `get_node_types` definitions payload into per-type sections.
 */
export function parseNodeTypeDefinitions(definitions: string): ParsedNodeSchemaSection[] {
    const sections: ParsedNodeSchemaSection[] = [];
    const headerPattern = /^##\s+(.+?)\s+\(v(\d+)\)\s*$/gm;

    const headers: Array<{ type: string; version: number; start: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = headerPattern.exec(definitions)) !== null) {
        headers.push({ type: match[1].trim(), version: Number(match[2]), start: match.index + match[0].length });
    }

    for (let h = 0; h < headers.length; h += 1) {
        const end = h + 1 < headers.length ? headers[h + 1].start : definitions.length;
        const body = definitions.slice(headers[h].start, end);

        // Locate the `<X>Params` declaration (interface or type alias) and slice
        // until ITS closing brace.
        const paramsOpen = body.match(/(?:interface|type)\s+\w+Params\s*(?:=\s*)?\{/);
        if (!paramsOpen || paramsOpen.index === undefined) continue;

        let depth = 1;
        const innerLines: string[] = [];
        for (const line of body.slice(paramsOpen.index + paramsOpen[0].length).split(/\r?\n/)) {
            if (depth <= 0) break;
            depth += countBraces(line);
            if (depth > 0) innerLines.push(line);
        }
        // Drop the final closing-brace line if it ended up included.
        while (innerLines.length > 0 && innerLines[innerLines.length - 1].trim() === '}') {
            innerLines.pop();
        }

        sections.push({
            type: headers[h].type,
            // The generator encodes the version without a dot (1.4 → 14, 3.1 → 31).
            version: headers[h].version / 10,
            properties: parseParamsInterfaceBody(innerLines),
        });
    }

    return sections;
}
