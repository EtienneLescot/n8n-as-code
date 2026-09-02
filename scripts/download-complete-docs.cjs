#!/usr/bin/env node

/**
 * Download Complete n8n Documentation
 * 
 * This script:
 * 1. Downloads llms.txt from docs.n8n.io
 * 2. Parses all documentation links
 * 3. Downloads each page (markdown)
 * 4. Organizes by category (integrations, tutorials, code, etc.)
 * 5. Extracts metadata (title, category, keywords)
 * 6. Generates metadata.json with complete index
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Configuration
const LLMS_TXT_URL = 'https://docs.n8n.io/llms.txt';
const OUTPUT_DIR = path.join(__dirname, '../packages/skills/src/assets/n8n-docs-cache');
const PAGES_DIR = path.join(OUTPUT_DIR, 'pages');
const METADATA_FILE = path.join(OUTPUT_DIR, 'metadata.json');
const LLMS_TXT_FILE = path.join(OUTPUT_DIR, 'llms.txt');

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 100; // ms
const MAX_CONCURRENT_DOWNLOADS = 10;

// Slug a section heading from llms.txt into a stable kebab-case id.
// The result is used as a directory name under PAGES_DIR, so every character
// outside [a-z0-9-] is replaced rather than passed through to path.join().
// Without this a heading containing a path separator or '..' would escape the
// cache directory. All nine section headings currently published in llms.txt
// slug identically under this rule, so it is a hardening, not a rename.
function slugifySection(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'uncategorized';
}

// Fallback category detection by URL prefix. Order matters — most specific first.
const CATEGORY_PATTERNS = {
    'get-started': /^(welcome|choose-how-to-use-n8n|build-your-first-workflow|learning-paths|key-concept-glossary)\.md$/,
    'deploy': /^deploy\//,
    'build': /^build\//,
    'nodes': /^integrations\//,
    'connect': /^connect\//,
    'administer': /^administer\//,
    'contribute': /^contribute\//,
    'privacy-and-security': /^privacy-and-security\//,
    'release-notes': /^release-notes\//,
};

/**
 * Download content from URL
 */
function downloadContent(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'n8n-as-code/1.0 (Documentation Indexer)',
                'Accept': 'text/plain, text/markdown, */*'
            }
        };

        https.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadContent(res.headers.location).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Parse llms.txt and extract all documentation links, attaching the current
 * `## Section` heading so consumers can use it as the page category directly.
 */
function parseLlmsTxt(content) {
    const links = [];
    const lines = content.split('\n');
    let currentSection = null;

    for (const line of lines) {
        const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
        if (sectionMatch) {
            currentSection = slugifySection(sectionMatch[1]);
            continue;
        }

        // Allow optional `: description` after the URL (llms.txt format).
        const linkMatch = line.match(/^- \[(.+?)\]\((https:\/\/docs\.n8n\.io\/([^)]+))\)(?::\s*.*)?$/);
        if (linkMatch) {
            const [, title, url, urlPath] = linkMatch;
            links.push({
                title: title.trim(),
                url: url.trim(),
                urlPath: urlPath.trim(),
                section: currentSection
            });
        }
    }

    return links;
}

/**
 * Detect category from URL path. Used as a fallback when the parser couldn't
 * attach a section heading to a link.
 */
function detectCategory(urlPath) {
    for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
        if (pattern.test(urlPath)) {
            return category;
        }
    }
    return 'other';
}

/**
 * Extract subcategory from URL path within the section-based category.
 */
function extractSubcategory(urlPath, category) {
    if (category === 'nodes') {
        if (urlPath.includes('/core-nodes/')) return 'core-nodes';
        if (urlPath.includes('/app-nodes/')) return 'app-nodes';
        if (urlPath.includes('/trigger-nodes/')) return 'trigger-nodes';
        if (urlPath.includes('/cluster-nodes/')) return 'cluster-nodes';
        if (urlPath.includes('/credentials/')) return 'credentials';
    }

    if (category === 'build') {
        if (urlPath.includes('/integrate-ai/ai-examples/')) return 'examples';
        if (urlPath.includes('/integrate-ai/')) return 'integrate-ai';
        if (urlPath.includes('/code-in-n8n/cookbook/')) return 'cookbook';
        if (urlPath.includes('/code-in-n8n/')) return 'code';
        if (urlPath.includes('/flow-logic')) return 'flow-logic';
        if (urlPath.includes('/work-with-data/')) return 'data';
    }

    if (category === 'deploy') {
        if (urlPath.includes('/configure-n8n/')) return 'configuration';
        if (urlPath.includes('/scaling/')) return 'scaling';
        if (urlPath.includes('/security/')) return 'security';
    }

    return null;
}

/**
 * Extract node name from integration URL
 * e.g., /integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/ → googleSheets
 */
function extractNodeName(urlPath) {
    const match = urlPath.match(/n8n-nodes-base\.([a-z0-9]+)/i);
    if (match) {
        // Convert from lowercase to camelCase (googlesheets → googleSheets)
        const nodeName = match[1];
        // Simple heuristic: if it's all lowercase, it might need camelCase conversion
        // For now, return as-is (we'll match against n8n-nodes-technical.json later)
        return nodeName;
    }
    return null;
}

/**
 * Extract keywords from title and content
 */
function extractKeywords(title, content) {
    const keywords = new Set();

    // Add words from title
    const titleWords = title.toLowerCase()
        .split(/[\s\-_\.]+/)
        .filter(w => w.length > 3);
    titleWords.forEach(w => keywords.add(w));

    // Extract from headers in markdown
    const headerMatches = content.matchAll(/^#+\s+(.+)$/gm);
    for (const match of headerMatches) {
        const headerWords = match[1].toLowerCase()
            .split(/[\s\-_\.]+/)
            .filter(w => w.length > 3);
        headerWords.forEach(w => keywords.add(w));
    }

    return Array.from(keywords);
}

/**
 * Extract use cases from documentation
 */
function extractUseCases(content) {
    const useCases = [];

    // Look for common patterns
    const patterns = [
        /(?:use case|example|scenario):\s*(.+?)(?:\n|$)/gi,
        /you can use (?:this|the .+?) to:\s*(.+?)(?:\n|$)/gi,
        /(?:perfect for|ideal for|great for):\s*(.+?)(?:\n|$)/gi,
    ];

    for (const pattern of patterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
            const useCase = match[1].trim();
            if (useCase.length > 10 && useCase.length < 200) {
                useCases.push(useCase);
            }
        }
    }

    return useCases.slice(0, 10); // Limit to 10
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function removeDirectoryIfExists(targetPath) {
    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
}

/**
 * Download all pages with rate limiting
 */
async function downloadAllPages(links, llmsHash) {
    const results = [];
    const errors = [];

    // Check if cache is sufficient
    if (fs.existsSync(METADATA_FILE)) {
        try {
            const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
            const cachedPages = Object.values(metadata.pages || {});
            // A run that hit download errors still writes metadata, so the hash alone
            // does not mean the cache is complete. Require a clean run and confirm every
            // referenced file is still on disk before skipping the download.
            const cacheIsComplete = metadata.llmsHash === llmsHash
                && metadata.totalPages > 0
                && metadata.errors === 0
                && fs.existsSync(PAGES_DIR)
                && cachedPages.length === metadata.totalPages
                && cachedPages.every(page => page.filePath && fs.existsSync(path.join(OUTPUT_DIR, page.filePath)));

            if (cacheIsComplete) {
                console.log(`\n✅ Cache found with ${metadata.totalPages} pages. Skipping all downloads.`);
                return { results: cachedPages, errors: [] };
            }

            console.log('\n🔄 Cached documentation is stale or incomplete. Refreshing documentation pages...');
            removeDirectoryIfExists(PAGES_DIR);
            await mkdir(PAGES_DIR, { recursive: true });
        } catch (e) {
            console.log('⚠️ Failed to read metadata, proceeding with download.');
        }
    }

    console.log(`\n📥 Downloading ${links.length} pages...`);

    // Process in batches
    for (let i = 0; i < links.length; i += MAX_CONCURRENT_DOWNLOADS) {
        const batch = links.slice(i, i + MAX_CONCURRENT_DOWNLOADS);

        const promises = batch.map(async (link, index) => {
            try {
                await sleep(DELAY_BETWEEN_REQUESTS * index);

                const content = await downloadContent(link.url);
                const category = link.section && link.section !== 'other'
                    ? link.section
                    : detectCategory(link.urlPath);
                const subcategory = extractSubcategory(link.urlPath, category);
                const nodeName = extractNodeName(link.urlPath);
                const keywords = extractKeywords(link.title, content);
                const useCases = extractUseCases(content);

                // Save page to disk
                const pageId = `page-${String(results.length + 1).padStart(4, '0')}`;
                const pagePath = path.join(PAGES_DIR, category, `${pageId}.md`);

                await mkdir(path.dirname(pagePath), { recursive: true });
                await writeFile(pagePath, content);

                if ((results.length + 1) % 50 === 0) {
                    console.log(`   Downloaded ${results.length + 1}/${links.length} pages...`);
                }

                const result = {
                    id: pageId,
                    title: link.title,
                    url: link.url,
                    urlPath: link.urlPath,
                    category,
                    subcategory,
                    nodeName,
                    keywords,
                    useCases,
                    contentLength: content.length,
                    filePath: path.relative(OUTPUT_DIR, pagePath)
                };

                results.push(result);

                return result;
            } catch (error) {
                errors.push({ link: link.url, error: error.message });
                console.error(`   ❌ Failed to download ${link.url}: ${error.message}`);
                return null;
            }
        });

        await Promise.all(promises);
    }

    console.log(`\n✅ Downloaded ${results.length} pages successfully`);
    if (errors.length > 0) {
        console.log(`⚠️  ${errors.length} errors occurred`);
    }

    return { results: results.filter(r => r !== null), errors };
}

/**
 * Generate metadata.json
 */
async function generateMetadata(pages, errors, llmsHash) {
    console.log('\n📊 Generating metadata...');

    // Group by category
    const byCategory = {};
    const byNodeName = {};

    for (const page of pages) {
        if (!byCategory[page.category]) {
            byCategory[page.category] = [];
        }
        byCategory[page.category].push(page.id);

        if (page.nodeName) {
            if (!byNodeName[page.nodeName]) {
                byNodeName[page.nodeName] = [];
            }
            byNodeName[page.nodeName].push(page.id);
        }
    }

    const metadata = {
        generatedAt: new Date().toISOString(),
        sourceUrl: LLMS_TXT_URL,
        llmsHash,
        totalPages: pages.length,
        errors: errors.length,
        statistics: {
            byCategory: Object.entries(byCategory).reduce((acc, [cat, pages]) => {
                acc[cat] = pages.length;
                return acc;
            }, {}),
            withNodeNames: Object.keys(byNodeName).length,
            withUseCases: pages.filter(p => p.useCases.length > 0).length,
        },
        pages: pages.reduce((acc, page) => {
            acc[page.id] = page;
            return acc;
        }, {}),
        index: {
            byCategory,
            byNodeName
        }
    };

    await writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));

    console.log('✅ Metadata generated');
    console.log(`   Total pages: ${metadata.totalPages}`);
    console.log(`   By category:`, metadata.statistics.byCategory);
    console.log(`   With node names: ${metadata.statistics.withNodeNames}`);
    console.log(`   With use cases: ${metadata.statistics.withUseCases}`);

    return metadata;
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 n8n Complete Documentation Downloader');
    console.log('=========================================\n');

    try {
        // Create output directories
        await mkdir(OUTPUT_DIR, { recursive: true });
        await mkdir(PAGES_DIR, { recursive: true });

        // Download llms.txt
        console.log(`📥 Downloading ${LLMS_TXT_URL}...`);
        const llmsTxtContent = await downloadContent(LLMS_TXT_URL);
        await writeFile(LLMS_TXT_FILE, llmsTxtContent);
        console.log('✅ llms.txt downloaded');
        const llmsHash = computeHash(llmsTxtContent);

        // Parse links
        console.log('\n📋 Parsing documentation links...');
        const links = parseLlmsTxt(llmsTxtContent);
        console.log(`✅ Found ${links.length} documentation pages`);

        // Download all pages
        const { results: pages, errors } = await downloadAllPages(links, llmsHash);

        // Generate metadata
        await generateMetadata(pages, errors, llmsHash);

        console.log('\n✨ Complete! Documentation downloaded successfully.');
        console.log(`   Output directory: ${OUTPUT_DIR}`);
        console.log(`   Metadata file: ${METADATA_FILE}`);

        // Exit explicitly to close all connections
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main };
