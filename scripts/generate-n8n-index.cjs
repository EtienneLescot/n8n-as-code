
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

let OUTPUT_FILE = (outputArg !== -1 && args[outputArg + 1])
    ? path.resolve(process.cwd(), args[outputArg + 1])
    : path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-nodes-index.json');

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

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const fullPath of allNodeFiles) {
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

            if (description && description.name && description.displayName) {
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
            } else if (description) {
                if (process.env.DEBUG) console.log(`❌ Invalid description specific data (missing name/displayName): ${path.basename(fullPath)}`);
                errorCount++;
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
        sourceFileCount: allNodeFiles.length,
        scanDirectories: SCAN_DIRS,
        nodes: results
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`💾 Saved index to: ${OUTPUT_FILE}`);
}

extractNodes();
