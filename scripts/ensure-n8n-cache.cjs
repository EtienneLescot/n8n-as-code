const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const https = require('https');

const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_DIR = path.resolve(ROOT_DIR, '.n8n-cache');
const CACHE_METADATA_PATH = path.join(CACHE_DIR, '.cache-metadata.json');
const N8N_REPO_URL = 'https://github.com/n8n-io/n8n.git';
const N8N_RELEASES_API_URL = 'https://api.github.com/repos/n8n-io/n8n/releases/latest';

function parseArgs(argv) {
    return {
        printTag: argv.includes('--print-tag'),
    };
}

function normalizeTag(rawTag) {
    if (!rawTag) {
        return null;
    }

    return rawTag.startsWith('n8n@') ? rawTag : `n8n@${rawTag}`;
}

function downloadJson(url) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'n8n-as-code/1.0',
            'Accept': 'application/vnd.github+json',
        };
        const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const request = https.get(url, {
            headers,
        }, (response) => {
            let data = '';

            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                const status = response.statusCode || 0;

                if (status !== 200) {
                    let message = `Failed to fetch ${url}: ${status}`;

                    if (status === 403 || status === 429) {
                        const details = [];
                        const rateLimitLimit = response.headers['x-ratelimit-limit'];
                        const rateLimitRemaining = response.headers['x-ratelimit-remaining'];
                        const rateLimitReset = response.headers['x-ratelimit-reset'];
                        const requestId = response.headers['x-github-request-id'];

                        if (rateLimitLimit !== undefined) details.push(`limit=${rateLimitLimit}`);
                        if (rateLimitRemaining !== undefined) details.push(`remaining=${rateLimitRemaining}`);
                        if (rateLimitReset !== undefined) details.push(`reset=${rateLimitReset}`);
                        if (requestId) details.push(`requestId=${requestId}`);

                        if (details.length) {
                            message += ` (rate limit details: ${details.join(', ')})`;
                        }
                    }

                    const trimmedBody = data.slice(0, 200).trim();
                    if (trimmedBody) {
                        message += `; response body: ${trimmedBody}`;
                    }

                    reject(new Error(message));
                    return;
                }

                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${error.message}`));
                }
            });
        });

        request.on('error', reject);
    });
}

async function resolveStableTag() {
    const overrideTag = normalizeTag(process.env.N8N_VERSION || process.env.N8N_STABLE_TAG);
    if (overrideTag) {
        return { tag: overrideTag, source: 'env' };
    }

    try {
        const release = await downloadJson(N8N_RELEASES_API_URL);
        const latestTag = normalizeTag(release.tag_name);
        if (latestTag) {
            return { tag: latestTag, source: 'github-api' };
        }
    } catch (error) {
        console.warn(`⚠️  Failed to resolve latest stable tag from GitHub API: ${error.message}`);
    }

    // Fallback to cached tag if available
    const cacheMetadata = readCacheMetadata();
    if (cacheMetadata?.resolvedTag) {
        console.log(`ℹ️  Falling back to cached tag: ${cacheMetadata.resolvedTag}`);
        return { tag: cacheMetadata.resolvedTag, source: 'cache-fallback' };
    }

    throw new Error('Could not resolve n8n stable tag (API failed and no cache metadata found).');
}

function run(command, cwd = ROOT_DIR) {
    console.log(`> ${command}`);
    try {
        execSync(command, { cwd, stdio: 'inherit' });
    } catch (error) {
        console.error(`❌ Command failed: ${command}`);
        process.exit(1);
    }
}

function removeDirectory(dir) {
    if (fs.existsSync(dir)) {
        console.log(`🗑️  Removing ${dir}...`);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function removeGitDirectory(dir) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) {
        console.log(`🗑️  Removing ${gitDir}...`);
        fs.rmSync(gitDir, { recursive: true, force: true });
    }
}

function readCacheMetadata() {
    if (!fs.existsSync(CACHE_METADATA_PATH)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(CACHE_METADATA_PATH, 'utf8'));
    } catch (error) {
        console.warn(`⚠️  Could not read cache metadata: ${error.message}`);
        return null;
    }
}

function writeCacheMetadata(metadata) {
    fs.writeFileSync(CACHE_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
}

function validateTag(tag) {
    // Allow only common safe characters for git tags/branches (e.g. v1.2.3, n8n@1.2.3)
    // This prevents shell metacharacters from being injected into command strings.
    const SAFE_TAG_REGEX = /^[0-9A-Za-z._\-\/@]+$/;
    if (typeof tag !== 'string' || !SAFE_TAG_REGEX.test(tag)) {
        throw new Error(
            `Invalid tag "${tag}". Tags may only contain letters, numbers, ".", "_", "-", "/", and "@".`,
        );
    }
}

function cloneCacheAtTag(tag) {
    validateTag(tag);
    removeDirectory(CACHE_DIR);
    console.log(`🚀 Cloning n8n repository (depth 1, tag ${tag})...`);
    execFileSync('git', ['clone', '--depth', '1', '--branch', tag, N8N_REPO_URL, '.n8n-cache'], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
    });
    writeCacheMetadata({
        resolvedTag: tag,
        resolvedAt: new Date().toISOString(),
    });
    removeGitDirectory(CACHE_DIR);
}

async function main() {
    const args = parseArgs(process.argv);
    const resolved = await resolveStableTag();

    if (args.printTag) {
        process.stdout.write(`${resolved.tag}\n`);
        return;
    }

    console.log('🔍 Checking n8n cache...');
    console.log(`🎯 Target n8n stable tag: ${resolved.tag} (${resolved.source})`);

    const cacheMetadata = readCacheMetadata();
    const cacheMatchesTarget = cacheMetadata?.resolvedTag === resolved.tag;

    if (!fs.existsSync(CACHE_DIR)) {
        cloneCacheAtTag(resolved.tag);
    } else {
        console.log('✅ Cache directory found.');

        if (!cacheMatchesTarget) {
            console.log(`⬇️  Cache tag mismatch (${cacheMetadata?.resolvedTag || 'unknown'} -> ${resolved.tag}). Refreshing cache...`);
            process.env.FORCE_REBUILD_NODES = 'true';
            cloneCacheAtTag(resolved.tag);
        } else {
            console.log('✨ Cache already matches the latest stable tag.');
            removeGitDirectory(CACHE_DIR);
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
