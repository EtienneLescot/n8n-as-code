
const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');

// Argument parsing
const args = process.argv.slice(2);
const sourceArg = args.indexOf('--source');
const outputArg = args.indexOf('--output');

let DIST_ROOT = (sourceArg !== -1 && args[sourceArg + 1])
    ? path.resolve(process.cwd(), args[sourceArg + 1])
    : path.resolve(ROOT_DIR, '.n8n-cache/packages/nodes-base/dist/nodes');

// If --source is a directory but doesn't end in /dist/nodes, try to append it
if (fs.existsSync(DIST_ROOT) && !DIST_ROOT.endsWith('dist/nodes')) {
    const potentialDist = path.join(DIST_ROOT, 'dist/nodes');
    if (fs.existsSync(potentialDist)) {
        DIST_ROOT = potentialDist;
    } else if (path.basename(DIST_ROOT) === 'nodes-base') {
        const p2 = path.join(DIST_ROOT, 'dist/nodes');
        if (fs.existsSync(p2)) DIST_ROOT = p2;
    }
}

let OUTPUT_FILE = (outputArg !== -1 && args[outputArg + 1])
    ? path.resolve(process.cwd(), args[outputArg + 1])
    : path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-nodes-index.json');

// The node_modules of nodes-base might be needed for some resolutions if not hoisted
const NODES_BASE_MODULES = path.resolve(DIST_ROOT, '../../node_modules');
const CACHE_ROOT_MODULES = path.resolve(DIST_ROOT, '../../../../node_modules');

// Ensure we can require modules from nodes-base (legacy dependencies)
if (fs.existsSync(NODES_BASE_MODULES)) {
    module.paths.push(NODES_BASE_MODULES);
}
if (fs.existsSync(CACHE_ROOT_MODULES)) {
    module.paths.push(CACHE_ROOT_MODULES);
}

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

async function extractNodes() {
    console.log('🚀 Starting Native Node Extraction...');
    console.log(`📂 Source: ${DIST_ROOT}`);

    if (!fs.existsSync(DIST_ROOT)) {
        console.error('❌ Error: dist/nodes directory not found. Please run "pnpm build" in .n8n-cache/packages/nodes-base first.');
        process.exit(1);
    }

    // Find all .node.js files
    const nodeFiles = findNodeFiles(DIST_ROOT);
    console.log(`📦 Found ${nodeFiles.length} source files.`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const fullPath of nodeFiles) {
        try {
            // NATIVE REQUIRE
            // We rely on standard node module resolution + our pushed path for deps
            const module = require(fullPath);

            const moduleKeys = Object.keys(module);
            let description = null;

            if (moduleKeys.length === 0) {
                if (process.env.DEBUG) console.log(`⚠️ Empty module: ${path.basename(fullPath)}`);
            }

            for (const key of moduleKeys) {
                const item = module[key];

                // Strategy A: Class (AwsS3V2, etc)
                if (typeof item === 'function' && item.prototype) {
                    // Check static property first
                    if (item.description) {
                        description = item.description;
                        break;
                    }

                    try {
                        // Try different instantiation signatures
                        const instance = new item();
                        if (instance.description) {
                            description = instance.description;
                            break;
                        }
                    } catch (e) {
                        try {
                            const instance = new item({ properties: [], inputs: [], outputs: [] });
                            if (instance.description) {
                                description = instance.description;
                                break;
                            }
                        } catch (e2) {
                            // If it fails, maybe it's on prototype (rare for fields but possible for getters)
                            if (item.prototype.description) {
                                description = item.prototype.description;
                                break;
                            }
                        }
                    }
                }

                // Strategy B: Object (Legacy)
                if (typeof item === 'object' && item !== null) {
                    if (item.description && (item.description.properties || item.description.name)) {
                        description = item.description;
                        break;
                    }
                }
            }

            if (description) {
                results.push({
                    name: description.name,
                    displayName: description.displayName,
                    description: description.description,
                    icon: description.icon,
                    group: description.group,
                    version: description.version,
                    properties: description.properties,
                    sourcePath: fullPath.replace(ROOT_DIR, '')
                });
                successCount++;
            } else {
                if (process.env.DEBUG) console.log(`❌ No description found for: ${path.basename(fullPath)} (Keys: ${moduleKeys.join(', ')})`);
                errorCount++;
            }

        } catch (error) {
            if (process.env.DEBUG) console.log(`💥 Error requiring ${path.basename(fullPath)}: ${error.message}`);
            errorCount++;
        }
    }

    console.log('\n\n✨ Extraction complete!');
    console.log(`✅ Extracted: ${successCount} nodes`);
    console.log(`❌ Skipped/Error: ${errorCount}`);

    // Create dir if not exists
    const outDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const outputData = {
        generatedAt: new Date().toISOString(),
        sourceFileCount: nodeFiles.length,
        nodes: results
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`💾 Saved index to: ${OUTPUT_FILE}`);
}

extractNodes();
