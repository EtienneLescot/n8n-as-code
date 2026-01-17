/**
 * Script to download n8n documentation from llms.txt and parse markdown files
 * This creates a rich documentation index for improved node search
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_CACHE_DIR = path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-docs-cache');
const LLMS_TXT_URL = 'https://docs.n8n.io/llms.txt';
const DOCS_BASE_URL = 'https://docs.n8n.io';

// Ensure cache directory exists
if (!fs.existsSync(DOCS_CACHE_DIR)) {
    fs.mkdirSync(DOCS_CACHE_DIR, { recursive: true });
}

/**
 * Download content from a URL
 */
function downloadUrl(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
        };
        
        https.get(options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                // Follow redirect
                return resolve(downloadUrl(res.headers.location));
            }
            
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
            }

            // Handle compression
            let stream = res;
            const encoding = res.headers['content-encoding'];
            
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                stream = res.pipe(zlib.createBrotliDecompress());
            }

            let data = '';
            stream.on('data', (chunk) => data += chunk);
            stream.on('end', () => resolve(data));
            stream.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Extract node documentation URLs from llms.txt
 */
function extractNodeDocUrls(llmsTxtContent) {
    const lines = llmsTxtContent.split('\n');
    const nodeUrls = [];
    
    for (const line of lines) {
        // Look for markdown links in the format: - [Node Name](url.md)
        const match = line.match(/- \[([^\]]+)\]\(([^)]+\.md)\)/);
        if (match) {
            const [, nodeName, relativeUrl] = match;
            // Only include integration/node pages (not general docs)
            if (relativeUrl.includes('/integrations/') || relativeUrl.includes('/app-nodes/') || relativeUrl.includes('/cluster-nodes/')) {
                nodeUrls.push({
                    name: nodeName,
                    url: relativeUrl.startsWith('http') ? relativeUrl : `${DOCS_BASE_URL}/${relativeUrl}`
                });
            }
        }
    }
    
    return nodeUrls;
}

/**
 * Parse markdown content to extract useful metadata
 */
function parseMarkdownMetadata(markdown, nodeName) {
    const metadata = {
        name: nodeName,
        operations: [],
        useCases: [],
        keywords: [],
        description: '',
        tags: []
    };

    // Extract first paragraph as description
    const firstParagraph = markdown.match(/^#[^\n]+\n\n([^\n]+)/);
    if (firstParagraph) {
        metadata.description = firstParagraph[1].trim();
    }

    // Extract operations from "Operations" section
    const operationsSection = markdown.match(/## Operations\s*\n([\s\S]*?)(?=\n##|\n---|\n\n#|$)/);
    if (operationsSection) {
        const operationsList = operationsSection[1];
        // Extract operation items (- Operation: Description)
        const operations = operationsList.matchAll(/[-*]\s+(?:\*\*)?([^:*\n]+)(?:\*\*)?:?\s*([^\n]*)/g);
        for (const [, operation, description] of operations) {
            const opText = `${operation} ${description}`.toLowerCase().trim();
            if (opText.length > 3 && !opText.startsWith('refer to') && !opText.startsWith('browse')) {
                metadata.operations.push(opText);
            }
        }
    }

    // Extract keywords from the content
    const text = markdown.toLowerCase();
    
    // Common AI/automation keywords
    const keywordPatterns = [
        'ai', 'artificial intelligence', 'machine learning', 'ml',
        'image', 'video', 'audio', 'text', 'document',
        'generate', 'create', 'analyze', 'transcribe', 'translate',
        'chat', 'chatbot', 'conversation', 'assistant',
        'vision', 'recognition', 'detection', 'classification',
        'embedding', 'vector', 'similarity', 'semantic',
        'prompt', 'completion', 'model', 'llm',
        'openai', 'google', 'anthropic', 'cohere', 'huggingface',
        'gemini', 'gpt', 'claude', 'palm'
    ];

    for (const keyword of keywordPatterns) {
        if (text.includes(keyword) && !metadata.keywords.includes(keyword)) {
            metadata.keywords.push(keyword);
        }
    }

    // Extract node name components as keywords
    const nameWords = nodeName
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .split(/[\s-_]+/)
        .filter(w => w.length > 2);
    
    for (const word of nameWords) {
        if (!metadata.keywords.includes(word)) {
            metadata.keywords.push(word);
        }
    }

    // Extract use cases from templates section
    const templatesSection = markdown.match(/## Templates and examples([\s\S]*?)(?=\n##|\n---|\n\n#|$)/);
    if (templatesSection) {
        const templates = templatesSection[1].matchAll(/\*\*([^*]+)\*\*/g);
        for (const [, template] of templates) {
            if (template.length > 5 && !template.startsWith('View')) {
                metadata.useCases.push(template.toLowerCase().trim());
            }
        }
    }

    return metadata;
}

/**
 * Main function to download and process documentation
 */
async function downloadDocs() {
    console.log('📥 Downloading llms.txt from n8n docs...');
    
    try {
        const llmsTxt = await downloadUrl(LLMS_TXT_URL);
        console.log('✅ Downloaded llms.txt');
        
        // Save llms.txt for reference
        fs.writeFileSync(path.join(DOCS_CACHE_DIR, 'llms.txt'), llmsTxt);
        
        const nodeUrls = extractNodeDocUrls(llmsTxt);
        console.log(`📝 Found ${nodeUrls.length} node documentation URLs`);
        
        const docsMetadata = {};
        let successCount = 0;
        let errorCount = 0;
        
        // Download markdown files (with rate limiting)
        for (let i = 0; i < nodeUrls.length; i++) {
            const { name, url } = nodeUrls[i];
            
            try {
                console.log(`[${i + 1}/${nodeUrls.length}] Downloading: ${name}`);
                const markdown = await downloadUrl(url);
                
                // Parse metadata
                const metadata = parseMarkdownMetadata(markdown, name);
                
                // Save markdown file
                const filename = name.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
                fs.writeFileSync(path.join(DOCS_CACHE_DIR, `${filename}.md`), markdown);
                
                // Store metadata
                docsMetadata[name] = {
                    ...metadata,
                    markdownUrl: url,
                    markdownFile: `${filename}.md`
                };
                
                successCount++;
                
                // Rate limiting: wait 100ms between requests
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.error(`❌ Failed to download ${name}: ${error.message}`);
                errorCount++;
            }
        }
        
        // Save metadata index
        const metadataFile = path.join(DOCS_CACHE_DIR, 'docs-metadata.json');
        fs.writeFileSync(metadataFile, JSON.stringify({
            generatedAt: new Date().toISOString(),
            totalNodes: nodeUrls.length,
            successCount,
            errorCount,
            nodes: docsMetadata
        }, null, 2));
        
        console.log('\n✨ Documentation download complete!');
        console.log(`✅ Success: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`💾 Saved to: ${DOCS_CACHE_DIR}`);
        console.log(`📋 Metadata: ${metadataFile}`);
        
    } catch (error) {
        console.error('💥 Fatal error:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    downloadDocs();
}

module.exports = { downloadDocs, parseMarkdownMetadata };
