
const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');

// Argument parsing
const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const outputArg = args.indexOf('--output');

// Support scanning multiple directories
let SCAN_DIRS = [];

if (sourceArg !== -1 && args[sourceArg + 1]) {
    // Custom source provided
    SCAN_DIRS = [path.resolve(process.cwd(), args[sourceArg + 1])];
} else {
    // Default: scan both nodes-base and nodes-langchain
    SCAN_DIRS = [
        path.resolve(ROOT_DIR, '.n8n-cache/packages/nodes-base/dist/nodes'),
        path.resolve(ROOT_DIR, '.n8n-cache/packages/@n8n/nodes-langchain/dist')
    ];
}

const OUTPUT_FILE = path.join(__dirname, '../packages/skills/src/assets/n8n-nodes-index.json');
const REPORT_FILE = path.join(__dirname, '../packages/skills/extraction-report.md');

// Add common node_modules paths for resolution
const CACHE_ROOT = path.resolve(ROOT_DIR, '.n8n-cache');
const CACHE_ROOT_MODULES = path.join(CACHE_ROOT, 'node_modules');
const NODES_BASE_MODULES = path.join(CACHE_ROOT, 'packages/nodes-base/node_modules');
const NODES_LANGCHAIN_MODULES = path.join(CACHE_ROOT, 'packages/@n8n/nodes-langchain/node_modules');

// Ensure we can require modules from both packages
[CACHE_ROOT_MODULES, NODES_BASE_MODULES, NODES_LANGCHAIN_MODULES].forEach(modulePath => {
    if (fs.existsSync(modulePath) && !module.paths.includes(modulePath)) {
        module.paths.push(modulePath);
    }
});

// Simple recursive file walker instead of glob dependency
function findNodeFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return [];

    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.resolve(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findNodeFiles(filePath));
        } else {
            if (file.endsWith('.node.js')) {
                results.push(filePath);
            }
        }
    });
    return results;
}

/**
 * Load a node module using CJS require, falling back to dynamic ESM import
 * when the file is an ES module (ERR_REQUIRE_ESM).  This is necessary because
 * newer versions of n8n-nodes-base compile to ESM output while the older
 * @n8n/nodes-langchain package may still emit CJS.  Without the fallback,
 * any ESM-compiled node file is silently skipped, which is why nodes like
 * `httpRequestTool` disappear from the generated schema.
 */
async function loadModule(fullPath) {
    try {
        return require(fullPath);
    } catch (err) {
        if (err.code === 'ERR_REQUIRE_ESM' || err.code === 'ERR_REQUIRE_ASYNC_MODULE') {
            // Dynamic import returns the module namespace – unwrap default if present
            const { pathToFileURL } = require('url');
            const ns = await import(pathToFileURL(fullPath).href);
            // Flatten the namespace so callers see the same shape as CJS exports
            if (ns.default && typeof ns.default === 'object') {
                return { ...ns, ...ns.default };
            }
            return ns;
        }
        throw err;
    }
}

/**
 * Extract a node description object from a loaded module, trying multiple
 * strategies to handle the various ways n8n nodes export their metadata.
 */
function extractDescription(module) {
    const moduleKeys = Object.keys(module);
    let description = null;

    if (moduleKeys.length === 0) {
        return null;
    }

    for (const key of moduleKeys) {
        const item = module[key];

        // Strategy A: Class with static or instance description
        if (typeof item === 'function' && item.prototype) {
            if (item.description) {
                return item.description;
            }

            try {
                const instance = new item();

                // Handle VersionedNodeType
                if (instance.nodeVersions) {
                    // When defaultVersion is not set, fall back to the highest version key
                    // (not the first key, which is the lowest/oldest version).
                    const versionKeys = Object.keys(instance.nodeVersions);
                    const defaultVersion = instance.defaultVersion ?? versionKeys.reduce((best, k) =>
                        parseFloat(k) > parseFloat(best) ? k : best, versionKeys[0]);
                    const version = instance.nodeVersions[defaultVersion];

                    if (version && version.description) {
                        description = version.description;
                        // Add all versions to description for indexing
                        description.allVersions = Object.keys(instance.nodeVersions).map(Number).sort((a, b) => a - b);
                    }
                } else if (instance.description) {
                    description = instance.description;
                }

                if (description) break;
            } catch (e) {
                if (process.env.DEBUG) console.log(`   ⚠️ Failed to instantiate ${key}: ${e.message}`);
            }
        }

        // Strategy B: Plain object export with description property
        if (typeof item === 'object' && item !== null) {
            if (item.description && (item.description.properties || item.description.name)) {
                description = item.description;
                break;
            }
        }
    }

    return description;
}

function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createToolVariantProperties(entry) {
    const properties = cloneValue(entry.properties || []);
    const hasToolDescription = properties.some((prop) => prop.name === 'toolDescription');

    if (hasToolDescription) {
        return properties;
    }

    const hasResource = properties.some((prop) => prop.name === 'resource');
    const hasOperation = properties.some((prop) => prop.name === 'operation');

    if (hasResource || hasOperation) {
        properties.push({
            displayName: 'Tool Description',
            name: 'descriptionType',
            type: 'options',
            options: [
                {
                    name: 'Set Automatically',
                    value: 'auto',
                    description: 'Automatically set based on resource and operation',
                },
                {
                    name: 'Set Manually',
                    value: 'manual',
                    description: 'Manually set the description',
                },
            ],
            default: 'auto',
        });
    }

    const toolDescription = {
        displayName: 'Description',
        name: 'toolDescription',
        type: 'string',
        default: entry.description || '',
        required: true,
        description: 'Explain to the LLM what this tool does so it can choose and use it correctly.',
    };

    if (hasResource || hasOperation) {
        toolDescription.displayOptions = {
            show: {
                descriptionType: ['manual'],
            },
        };
    }

    properties.push(toolDescription);
    return properties;
}

/**
 * Compare two entries for the same index key (e.g. the V1 and V2 files of one node)
 * and tell whether the candidate carries richer metadata than the one already stored.
 */
function isBetterEntry(candidate, existing) {
    const existingHasVersions = Array.isArray(existing.version) && existing.version.length > 1;
    const candidateHasVersions = Array.isArray(candidate.version) && candidate.version.length > 1;
    if (candidateHasVersions !== existingHasVersions) return candidateHasVersions;
    return (candidate.properties?.length || 0) > (existing.properties?.length || 0);
}

/**
 * Store an entry under `key`, keeping the richer one when the key is already taken.
 * Entries stored under anything other than their short name carry `indexKey` so the
 * enrichment step keys the technical index the same way.
 */
function storeEntry(resultsMap, key, entry) {
    const existing = resultsMap.get(key);
    if (existing && !isBetterEntry(entry, existing)) return false;

    resultsMap.set(key, key === entry.name ? entry : { ...entry, indexKey: key });
    return !existing;
}

/**
 * Insert an extracted node into the index map. The short name is the primary key; when two
 * packages ship the same one (n8n-nodes-base.code vs @n8n/n8n-nodes-langchain.code) the base
 * node keeps it — short-name lookups stay backwards compatible — and the other variant is
 * indexed under its full type instead of being dropped, so it stays reachable by full type.
 * Returns true when a new key was created.
 */
function indexNodeEntry(resultsMap, entry) {
    const shortEntry = resultsMap.get(entry.name);
    if (!shortEntry || shortEntry.fullType === entry.fullType) {
        return storeEntry(resultsMap, entry.name, entry);
    }

    const demoted = entry.fullType.startsWith('n8n-nodes-base.') ? shortEntry : entry;
    if (demoted !== entry) {
        resultsMap.set(entry.name, entry);
    }
    return storeEntry(resultsMap, demoted.fullType, demoted);
}

function createToolVariantEntry(entry) {
    const typePrefix = entry.fullType.includes('.')
        ? entry.fullType.slice(0, entry.fullType.lastIndexOf('.'))
        : 'n8n-nodes-base';

    return {
        ...entry,
        name: `${entry.name}Tool`,
        fullType: `${typePrefix}.${entry.name}Tool`,
        displayName: entry.displayName.endsWith(' Tool') ? entry.displayName : `${entry.displayName} Tool`,
        description: entry.description || `${entry.displayName} tool variant`,
        properties: createToolVariantProperties(entry),
        sourcePath: entry.sourcePath || '(virtual)',
        usableAsTool: false,
    };
}

async function extractNodes() {
    console.log('🚀 Starting Native Node Extraction...');
    console.log(`📂 Scanning directories:`);

    // Collect all node files from all scan directories
    let allNodeFiles = [];

    for (const scanDir of SCAN_DIRS) {
        console.log(`   - ${scanDir}`);

        if (!fs.existsSync(scanDir)) {
            console.warn(`   ⚠️  Directory not found, skipping: ${scanDir}`);
            continue;
        }

        const nodeFiles = findNodeFiles(scanDir);
        console.log(`   ✓ Found ${nodeFiles.length} files`);
        allNodeFiles = allNodeFiles.concat(nodeFiles);
    }

    if (allNodeFiles.length === 0) {
        console.error('❌ Error: No node files found. Please run ensure-n8n-cache.cjs first.');
        process.exit(1);
    }

    console.log(`\n📦 Total source files: ${allNodeFiles.length}`);

    const resultsMap = new Map();
    let successCount = 0;
    let errorCount = 0;

    for (const fullPath of allNodeFiles) {
        try {
            const module = await loadModule(fullPath);

            if (process.env.DEBUG && Object.keys(module).length === 0) {
                console.log(`⚠️ Empty module: ${path.basename(fullPath)}`);
            }

            const description = extractDescription(module);

            if (description && description.name && description.displayName) {
                // Determine full type name based on package
                let prefix = 'n8n-nodes-base';
                const pathParts = fullPath.split(path.sep);
                // Only use langchain prefix if specifically in nodes-langchain package
                // IMPORTANT: n8n requires the @n8n scope for langchain nodes in the type string
                if (pathParts.includes('nodes-langchain')) {
                    prefix = '@n8n/n8n-nodes-langchain';
                }

                const fullType = `${prefix}.${description.name}`;
                const entry = {
                    name: description.name,
                    fullType: fullType,
                    displayName: description.displayName,
                    description: description.description,
                    icon: description.icon,
                    group: description.group,
                    version: description.allVersions || description.version || 1,
                    credentials: cloneValue(description.credentials || []),
                    properties: description.properties || [],
                    sourcePath: fullPath.replace(ROOT_DIR, ''),
                    usableAsTool: Boolean(description.usableAsTool)
                };

                // VERSIONING LOGIC: deduplicate by name, keeping same-name variants from
                // different packages under their full type (see indexNodeEntry).
                if (indexNodeEntry(resultsMap, entry)) {
                    successCount++;
                    if (process.env.DEBUG) console.log(`   ➕ Adding ${description.name} (${fullType})`);
                } else if (process.env.DEBUG) {
                    console.log(`   ⏭️  Duplicate ${description.name} from ${path.basename(fullPath)} (kept the richer entry)`);
                }
            } else if (description) {
                if (process.env.DEBUG) console.log(`❌ Invalid description specific data (missing name/displayName): ${path.basename(fullPath)}`);
                errorCount++;
            } else {
                if (process.env.DEBUG) console.log(`❌ No description found for: ${path.basename(fullPath)} (Keys: ${Object.keys(module).join(', ')})`);
                errorCount++;
            }

        } catch (error) {
            if (process.env.DEBUG) console.log(`💥 Error requiring ${path.basename(fullPath)}: ${error.message}`);
            errorCount++;
        }
    }

    // ── Inject virtual / synthetic tool nodes ───────────────────────────
    // n8n can expose a tool variant for nodes flagged usableAsTool even when
    // there is no physical *.node.js file for the suffixed type.
    let injectedToolCount = 0;

    for (const entry of Array.from(resultsMap.values())) {
        if (!entry.usableAsTool || entry.name.endsWith('Tool')) {
            continue;
        }

        const toolEntry = createToolVariantEntry(entry);
        // A node that lost the short-name race is keyed by full type; its tool variant
        // follows the same rule so it can't claim the short key from the other package.
        const toolKey = entry.indexKey ? toolEntry.fullType : toolEntry.name;
        if (resultsMap.has(toolKey)) {
            if (process.env.DEBUG) console.log(`   ⏭️  Virtual node ${toolKey} already in index, skipping`);
            continue;
        }

        storeEntry(resultsMap, toolKey, toolEntry);
        successCount++;
        injectedToolCount++;
        if (process.env.DEBUG) {
            console.log(`   🧩 Injected virtual node: ${toolEntry.name} (${toolEntry.fullType})`);
        }
    }

    if (injectedToolCount > 0) {
        console.log(`   🧩 Injected ${injectedToolCount} synthetic tool node${injectedToolCount === 1 ? '' : 's'}`);
    }

    console.log('\n\n✨ Extraction complete!');
    console.log(`✅ Extracted: ${successCount} nodes`);
    console.log(`❌ Skipped/Error: ${errorCount}`);

    // Create dir if not exists
    const outDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outputData = {
        generatedAt: new Date().toISOString(),
        sourceFileCount: allNodeFiles.length,
        scanDirectories: SCAN_DIRS,
        nodes: Array.from(resultsMap.values())
    };

    // Minified: build intermediate consumed only by the enrichment scripts.
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData));
    console.log(`💾 Saved index to: ${OUTPUT_FILE}`);
}

if (require.main === module) {
    extractNodes();
}

module.exports = { loadModule, extractDescription, indexNodeEntry };
