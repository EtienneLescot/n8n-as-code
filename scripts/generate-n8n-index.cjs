
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

// Ensure we can require modules from nodes-base (legacy dependencies)
if (fs.existsSync(NODES_BASE_MODULES)) {
    module.paths.push(NODES_BASE_MODULES);
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

    const results = {};
    let successCount = 0;
    let errorCount = 0;

    for (const fullPath of nodeFiles) {
        try {
            // NATIVE REQUIRE
            // We rely on standard node module resolution + our pushed path for deps
            const module = require(fullPath);

            const moduleKeys = Object.keys(module);
            let description = null;

            for (const key of moduleKeys) {
                const item = module[key];

                // Strategy A: Class (AwsS3V2, etc)
                if (typeof item === 'function' && item.prototype) {
                    try {
                        // Try instantiating with empty baseDescription
                        // Some nodes (Versioned) require a baseDescription in constructor
                        const instance = new item({ properties: [], inputs: [], outputs: [] });

                        if (instance.description) {
                            description = instance.description;
                            break;
                        }
                    } catch (e) {
                        // Ignore instantiation errors
                    }
                }

                // Strategy B: Object (Legacy)
                if (typeof item === 'object' && item.description && item.description.properties) {
                    description = item.description;
                    break;
                }
            }

            if (description) {
                let nodeName = description.name;

                // Fallback: Infer name from filename if missing (common in Versioned nodes like SwitchV3)
                if (!nodeName) {
                    const filename = path.basename(fullPath);
                    // Remove extension and V suffix (SwitchV3.node.js -> Switch)
                    const cleanName = filename
                        .replace(/\.node\.js$/, '')
                        .replace(/V[0-9]+$/, '');

                    // camelCase it (Switch -> switch)
                    nodeName = cleanName.charAt(0).toLowerCase() + cleanName.slice(1);
                }

                if (nodeName) {
                    const newPropsCount = description.properties ? description.properties.length : 0;

                    if (results[nodeName]) {
                        // Collision detected!
                        // Strategy: Keep the one with more properties
                        const existingPropsCount = results[nodeName].properties ? results[nodeName].properties.length : 0;

                        if (newPropsCount > existingPropsCount) {
                            results[nodeName] = description;
                        }
                        // Else: keep existing
                    } else {
                        // New entry
                        results[nodeName] = description;
                    }

                    successCount++;
                    if (successCount % 50 === 0) process.stdout.write('.');
                } else {
                    errorCount++; // Still couldn't determine a name
                }
            } else {
                errorCount++;
            }

        } catch (error) {
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
