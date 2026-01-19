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
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

// Configuration
const LLMS_TXT_URL = 'https://docs.n8n.io/llms.txt';
const OUTPUT_DIR = path.join(__dirname, '../packages/agent-cli/src/assets/n8n-docs-cache');
const PAGES_DIR = path.join(OUTPUT_DIR, 'pages');
const METADATA_FILE = path.join(OUTPUT_DIR, 'metadata.json');

// Rate limiting
const DELAY_BETWEEN_REQUESTS = 100; // ms
const MAX_CONCURRENT_DOWNLOADS = 10;

// Category detection patterns (order matters - most specific first)
// Note: urlPath doesn't start with /, so patterns match without leading slash
const CATEGORY_PATTERNS = {
    'advanced-ai': /^advanced-ai\//,
    credentials: /^credentials\//,
    tutorials: /^courses\/|^video-courses\//,
    hosting: /^hosting\//,
    api: /^api\//,
    integrations: /^integrations\/builtin\/app-nodes\//,
    'trigger-nodes': /^integrations\/builtin\/trigger-nodes\//,
    'core-nodes': /^integrations\/builtin\/core-nodes\//,
    'cluster-nodes': /^integrations\/builtin\/cluster-nodes\//,
    'flow-logic': /^flow-logic\//,
    data: /^data\//,
    workflows: /^workflows\//,
    code: /\/code\//,  // Can be anywhere in path
    expressions: /^expressions\//,
    'try-it-out': /^try-it-out\//,
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
 * Parse llms.txt and extract all documentation links
 */
function parseLlmsTxt(content) {
    const links = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
        // Match markdown links: - [Title](https://docs.n8n.io/path/index.md)
        const match = line.match(/^- \[(.+?)\]\((https:\/\/docs\.n8n\.io\/(.+?))\)$/);
        if (match) {
            const [, title, url, urlPath] = match;
            links.push({
                title: title.trim(),
                url: url.trim(),
                urlPath: urlPath.trim()
            });
        }
    }
    
    return links;
}

/**
 * Detect category from URL path
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
 * Extract subcategory from URL path
 */
function extractSubcategory(urlPath, category) {
    if (category === 'integrations') {
        if (urlPath.includes('/app-nodes/')) return 'app-nodes';
        if (urlPath.includes('/trigger-nodes/')) return 'trigger-nodes';
        if (urlPath.includes('/core-nodes/')) return 'core-nodes';
        if (urlPath.includes('/credentials/')) return 'credentials';
    }
    
    if (category === 'advanced-ai') {
        if (urlPath.includes('/examples/')) return 'examples';
        if (urlPath.includes('/langchain/')) return 'langchain';
        if (urlPath.includes('/evaluations/')) return 'evaluations';
    }
    
    if (category === 'code') {
        if (urlPath.includes('/builtin/')) return 'builtin';
        if (urlPath.includes('/cookbook/')) return 'cookbook';
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

/**
 * Download all pages with rate limiting
 */
async function downloadAllPages(links) {
    console.log(`\n📥 Downloading ${links.length} pages...`);
    
    const results = [];
    const errors = [];
    
    // Process in batches
    for (let i = 0; i < links.length; i += MAX_CONCURRENT_DOWNLOADS) {
        const batch = links.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
        
        const promises = batch.map(async (link, index) => {
            try {
                await sleep(DELAY_BETWEEN_REQUESTS * index);
                
                const content = await downloadContent(link.url);
                const category = detectCategory(link.urlPath);
                const subcategory = extractSubcategory(link.urlPath, category);
                const nodeName = extractNodeName(link.urlPath);
                const keywords = extractKeywords(link.title, content);
                const useCases = extractUseCases(content);
                
                // Save page to disk
                const pageId = `page-${String(results.length + 1).padStart(4, '0')}`;
                const safePath = link.urlPath.replace(/[^a-zA-Z0-9\/\-_.]/g, '-');
                const pagePath = path.join(PAGES_DIR, category, `${pageId}.md`);
                
                await mkdir(path.dirname(pagePath), { recursive: true });
                await writeFile(pagePath, content);
                
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
                
                if ((results.length) % 50 === 0) {
                    console.log(`   Downloaded ${results.length}/${links.length} pages...`);
                }
                
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
async function generateMetadata(pages, errors) {
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
        await writeFile(path.join(OUTPUT_DIR, 'llms.txt'), llmsTxtContent);
        console.log('✅ llms.txt downloaded');
        
        // Parse links
        console.log('\n📋 Parsing documentation links...');
        const links = parseLlmsTxt(llmsTxtContent);
        console.log(`✅ Found ${links.length} documentation pages`);
        
        // Download all pages
        const { results: pages, errors } = await downloadAllPages(links);
        
        // Generate metadata
        await generateMetadata(pages, errors);
        
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
