#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ROOT_DIR = path.resolve(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, '.temp-workflows');
const REPO_URL = 'https://github.com/nusquama/n8nworkflows.xyz.git';
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'packages/skills/src/assets/workflows-index.json');

// Argument parsing
const args = process.argv.slice(2);
const shallowFlag = args.includes('--shallow');
const CLONE_DEPTH = shallowFlag ? 1 : undefined; // Full clone by default for complete history

function removeGitDirectory(dir) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) {
        console.log(`   🗑️  Removing ${gitDir}...`);
        fs.rmSync(gitDir, { recursive: true, force: true });
    }
}

/**
 * Clone or update the workflows repository
 */
function ensureRepository() {
    console.log('📦 Ensuring workflows repository...');

    if (fs.existsSync(TEMP_DIR)) {
        console.log('   ✓ Repository exists, pulling latest changes...');
        try {
            execSync('git pull', { cwd: TEMP_DIR, stdio: 'inherit' });
            removeGitDirectory(TEMP_DIR);
        } catch (error) {
            console.warn('   ⚠️  Pull failed, removing and re-cloning...');
            fs.rmSync(TEMP_DIR, { recursive: true, force: true });
            cloneRepository();
        }
    } else {
        cloneRepository();
    }
}

function cloneRepository() {
    console.log(`   📥 Cloning ${REPO_URL}...`);
    const depthArg = CLONE_DEPTH ? `--depth ${CLONE_DEPTH}` : '';
    execSync(`git clone ${depthArg} ${REPO_URL} ${TEMP_DIR}`, { stdio: 'inherit' });
    console.log('   ✓ Clone complete');
    removeGitDirectory(TEMP_DIR);
}

/**
 * Find all metadata.json files in the workflows directory
 */
function findMetadataFiles() {
    console.log('\n🔍 Scanning for workflow metadata...');

    // Try both possible directory structures
    const possibleDirs = [
        path.join(TEMP_DIR, 'workflows'),
        path.join(TEMP_DIR, 'archive', 'workflows')
    ];

    let workflowsDir = null;
    for (const dir of possibleDirs) {
        if (fs.existsSync(dir)) {
            workflowsDir = dir;
            console.log(`   ✓ Found workflows directory: ${path.relative(TEMP_DIR, dir)}`);
            break;
        }
    }

    if (!workflowsDir) {
        console.error('❌ Error: Could not find workflows directory');
        process.exit(1);
    }

    const metadataFiles = [];
    const workflowDirs = fs.readdirSync(workflowsDir, { withFileTypes: true });

    for (const dirent of workflowDirs) {
        if (!dirent.isDirectory()) continue;

        const dirPath = path.join(workflowsDir, dirent.name);

        // Look for metadata.json or metada-*.json (typo in the repository)
        let metadataPath = path.join(dirPath, 'metadata.json');

        if (!fs.existsSync(metadataPath)) {
            // Try to find metada-*.json files
            const files = fs.readdirSync(dirPath);
            const metadaFile = files.find(f => f.startsWith('metada-') && f.endsWith('.json'));
            if (metadaFile) {
                metadataPath = path.join(dirPath, metadaFile);
            }
        }

        if (fs.existsSync(metadataPath)) {
            metadataFiles.push({
                metadataPath,
                slug: dirent.name,
                workflowDir: dirPath
            });
        }
    }

    console.log(`   ✓ Found ${metadataFiles.length} workflows`);
    return metadataFiles;
}

/**
 * Parse and validate metadata
 */
function parseMetadata(file) {
    try {
        const raw = fs.readFileSync(file.metadataPath, 'utf-8');
        const metadata = JSON.parse(raw);

        // Extract ID from slug (usually last part after dash)
        const idMatch = file.slug.match(/-(\d+)$/);
        const id = idMatch ? parseInt(idMatch[1], 10) : null;

        // Extract name from slug (remove ID suffix and convert dashes to spaces)
        let name = file.slug;
        if (idMatch) {
            name = file.slug.substring(0, file.slug.lastIndexOf('-'));
        }
        // Clean up the name: replace dashes/underscores with spaces, capitalize
        name = name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Extract tags from categories
        const tags = Array.isArray(metadata.categories)
            ? metadata.categories.map(cat => typeof cat === 'object' ? cat.name : cat).filter(Boolean)
            : [];

        // Check for workflow.json existence
        const workflowFiles = fs.readdirSync(file.workflowDir);
        const workflowJsonFile = workflowFiles.find(f => f.endsWith('.json') && !f.startsWith('metada'));
        const hasWorkflow = !!workflowJsonFile;

        return {
            id: id || file.slug, // Fallback to slug if no numeric ID
            slug: file.slug,
            name: name,
            tags: tags,
            author: metadata.user_username || metadata.user_name || 'unknown',
            createdAt: null, // Not available in this metadata format
            description: null, // Not available in this metadata format
            hasWorkflow,
            workflowFile: workflowJsonFile || null,
            url: metadata.url || metadata.url_n8n || null,
            nodeTypes: metadata.nodeTypes ? Object.keys(metadata.nodeTypes) : []
        };
    } catch (error) {
        console.warn(`   ⚠️  Failed to parse ${file.slug}: ${error.message}`);
        return null;
    }
}

/**
 * Build the index
 */
function buildIndex() {
    console.log('\n🏗️  Building workflow index...');

    ensureRepository();
    const metadataFiles = findMetadataFiles();

    const workflows = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of metadataFiles) {
        const parsed = parseMetadata(file);
        if (parsed) {
            workflows.push(parsed);
            successCount++;
        } else {
            errorCount++;
        }
    }

    console.log('\n✨ Index generation complete!');
    console.log(`✅ Processed: ${successCount} workflows`);
    console.log(`❌ Skipped/Error: ${errorCount}`);

    // Create output directory if needed
    const outDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const outputData = {
        generatedAt: new Date().toISOString(),
        repository: REPO_URL,
        totalWorkflows: workflows.length,
        workflows: workflows.sort((a, b) => {
            // Sort by ID (numeric) if available, otherwise by slug
            if (typeof a.id === 'number' && typeof b.id === 'number') {
                return b.id - a.id; // Descending (newest first)
            }
            return a.slug.localeCompare(b.slug);
        })
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));
    console.log(`💾 Saved index to: ${OUTPUT_FILE}`);

    // Calculate size
    const stats = fs.statSync(OUTPUT_FILE);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`📊 Index size: ${sizeKB} KB (${stats.size} bytes)`);
}

// Run
buildIndex();
