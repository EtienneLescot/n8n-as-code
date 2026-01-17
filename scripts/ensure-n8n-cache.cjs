const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(ROOT_DIR, '.n8n-cache');
const N8N_REPO_URL = 'https://github.com/n8n-io/n8n.git';
const N8N_STABLE_TAG = 'n8n@1.74.2'; // Use a known stable tag to avoid master branch breakages

function run(command, cwd = ROOT_DIR) {
    console.log(`> ${command}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        process.exit(1);
    }
}

async function main() {
    console.log('🔍 Checking n8n cache...');

    if (!fs.existsSync(CACHE_DIR)) {
        console.log(`🚀 Cache missing. Cloning n8n repository (depth 1, tag ${N8N_STABLE_TAG})...`);
        run(`git clone --depth 1 --branch ${N8N_STABLE_TAG} ${N8N_REPO_URL} .n8n-cache`);
    } else {
        console.log('✅ Cache directory found.');

        // Try to update if it's a git repo
        if (fs.existsSync(path.join(CACHE_DIR, '.git'))) {
            console.log(`🔄 Checking for updates in n8n repository (target: ${N8N_STABLE_TAG})...`);
            try {
                const local = execSync('git rev-parse HEAD', { cwd: CACHE_DIR }).toString().trim();
                const target = execSync(`git rev-parse ${N8N_STABLE_TAG}`, { cwd: CACHE_DIR }).toString().trim();

                if (local !== target) {
                    console.log('⬇️  Updating cache to stable tag...');
                    run(`git fetch --depth 1 origin ${N8N_STABLE_TAG}`, CACHE_DIR);
                    run(`git reset --hard ${N8N_STABLE_TAG}`, CACHE_DIR);
                    // Force rebuild of nodes-base if updated
                    process.env.FORCE_REBUILD_NODES = 'true';
                } else {
                    console.log('✨ Cache is already at the correct stable tag.');
                }
            } catch (e) {
                console.warn('⚠️  Could not check for updates. Using existing cache.');
            }
        }
    }

    const nodesBaseDir = path.join(CACHE_DIR, 'packages/nodes-base');
    const nodesBaseDist = path.join(nodesBaseDir, 'dist/nodes');
    
    const nodesLangchainDir = path.join(CACHE_DIR, 'packages/@n8n/nodes-langchain');
    const nodesLangchainDist = path.join(nodesLangchainDir, 'dist');

    const needsRebuild = !fs.existsSync(nodesBaseDist) || 
                        !fs.existsSync(nodesLangchainDist) || 
                        process.env.FORCE_REBUILD_NODES === 'true';

    if (needsRebuild) {
        console.log('🏗 Preparing n8n nodes (this may take a while)...');

        console.log('📦 Installing dependencies (root)...');
        run('pnpm install', CACHE_DIR);

        console.log('🔨 Building n8n-nodes-base (with dependencies)...');
        run('pnpm build --filter n8n-nodes-base...', CACHE_DIR);
        
        console.log('🔨 Building @n8n/nodes-langchain (AI nodes)...');
        run('pnpm build --filter @n8n/n8n-nodes-langchain', CACHE_DIR);
    } else {
        console.log('✅ n8n nodes-base and nodes-langchain are already built.');
    }
}

main().catch(err => {
    console.error('💥 Unexpected error:', err);
    process.exit(1);
});
