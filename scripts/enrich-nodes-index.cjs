/**
 * Script to enrich the n8n nodes index with documentation metadata
 * This combines the technical schemas with human-readable documentation
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const NODES_INDEX_FILE = path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-nodes-index.json');
const DOCS_METADATA_FILE = path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-docs-cache/docs-metadata.json');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-nodes-enriched.json');

/**
 * Normalize node name for matching (remove spaces, lowercase, remove special chars)
 */
function normalizeNodeName(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Try to match a node from the schema with documentation
 * Returns the best matching doc or null
 */
function findMatchingDoc(node, docsNodes) {
    const nodeName = normalizeNodeName(node.name || '');
    const nodeDisplayName = normalizeNodeName(node.displayName || '');
    
    // Try exact matches first
    for (const [docName, docData] of Object.entries(docsNodes)) {
        const docNameNorm = normalizeNodeName(docName);
        
        if (docNameNorm === nodeName || docNameNorm === nodeDisplayName) {
            return docData;
        }
    }
    
    // Try partial matches (doc name contains node name or vice versa)
    for (const [docName, docData] of Object.entries(docsNodes)) {
        const docNameNorm = normalizeNodeName(docName);
        
        if (docNameNorm.includes(nodeName) || nodeName.includes(docNameNorm)) {
            return docData;
        }
        
        if (docNameNorm.includes(nodeDisplayName) || nodeDisplayName.includes(docNameNorm)) {
            return docData;
        }
    }
    
    return null;
}

/**
 * Extract additional keywords from node schema
 */
function extractSchemaKeywords(node) {
    const keywords = new Set();
    
    // From node name
    const nameWords = (node.name || '')
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .split(/[\s-_]+/)
        .filter(w => w.length > 2);
    
    nameWords.forEach(w => keywords.add(w));
    
    // From display name
    const displayWords = (node.displayName || '')
        .toLowerCase()
        .split(/[\s-_]+/)
        .filter(w => w.length > 2);
    
    displayWords.forEach(w => keywords.add(w));
    
    // From description
    if (node.description) {
        const descWords = node.description
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3);
        
        // Only add first few significant words from description
        descWords.slice(0, 10).forEach(w => keywords.add(w));
    }
    
    // From group (category)
    if (Array.isArray(node.group)) {
        node.group.forEach(g => {
            const groupWords = g.toLowerCase().split(/[\s-_]+/);
            groupWords.forEach(w => {
                if (w.length > 2) keywords.add(w);
            });
        });
    }
    
    return Array.from(keywords);
}

/**
 * Calculate a search score for keyword relevance
 */
function calculateKeywordScore(keywords) {
    // AI/automation related keywords get higher scores
    const highValueKeywords = new Set([
        'ai', 'openai', 'google', 'anthropic', 'cohere', 'huggingface',
        'gemini', 'gpt', 'claude', 'palm', 'llm', 'chat', 'assistant',
        'image', 'video', 'audio', 'generate', 'analyze', 'transcribe',
        'vision', 'recognition', 'embedding', 'vector', 'semantic'
    ]);
    
    let score = 0;
    keywords.forEach(keyword => {
        if (highValueKeywords.has(keyword.toLowerCase())) {
            score += 10;
        } else {
            score += 1;
        }
    });
    
    return score;
}

/**
 * Main enrichment function
 */
async function enrichNodesIndex() {
    console.log('🔄 Starting node index enrichment...');
    
    // Load nodes index
    if (!fs.existsSync(NODES_INDEX_FILE)) {
        console.error(`❌ Nodes index not found: ${NODES_INDEX_FILE}`);
        console.log('Please run: node scripts/generate-n8n-index.cjs first');
        process.exit(1);
    }
    
    console.log('📂 Loading nodes index...');
    const nodesIndex = JSON.parse(fs.readFileSync(NODES_INDEX_FILE, 'utf8'));
    console.log(`✓ Loaded ${nodesIndex.nodes.length} nodes`);
    
    // Load documentation metadata (optional)
    let docsMetadata = null;
    if (fs.existsSync(DOCS_METADATA_FILE)) {
        console.log('📂 Loading documentation metadata...');
        docsMetadata = JSON.parse(fs.readFileSync(DOCS_METADATA_FILE, 'utf8'));
        console.log(`✓ Loaded documentation for ${Object.keys(docsMetadata.nodes).length} nodes`);
    } else {
        console.warn('⚠️  Documentation metadata not found. Enriching with schema data only.');
        console.log('To include documentation, run: node scripts/download-n8n-docs.cjs first');
    }
    
    // Enrich each node
    console.log('\n🔧 Enriching nodes...');
    const enrichedNodes = {};
    let matchedCount = 0;
    let enrichedCount = 0;
    
    for (const node of nodesIndex.nodes) {
        const nodeKey = node.name;
        
        // Find matching documentation
        let docData = null;
        if (docsMetadata) {
            docData = findMatchingDoc(node, docsMetadata.nodes);
            if (docData) {
                matchedCount++;
            }
        }
        
        // Extract keywords from schema
        const schemaKeywords = extractSchemaKeywords(node);
        
        // Combine keywords from both sources
        const allKeywords = new Set([...schemaKeywords]);
        let operations = [];
        let useCases = [];
        
        if (docData) {
            docData.keywords.forEach(k => allKeywords.add(k));
            operations = docData.operations || [];
            useCases = docData.useCases || [];
        }
        
        const keywords = Array.from(allKeywords);
        const keywordScore = calculateKeywordScore(keywords);
        
        // Build enriched entry
        enrichedNodes[nodeKey] = {
            // Core schema
            name: node.name,
            displayName: node.displayName,
            description: node.description,
            version: node.version,
            group: node.group,
            icon: node.icon,
            
            // Full schema for generation
            schema: {
                properties: node.properties,
                sourcePath: node.sourcePath
            },
            
            // Enriched metadata for search
            metadata: {
                keywords,
                operations,
                useCases,
                keywordScore,
                hasDocumentation: !!docData,
                markdownUrl: docData?.markdownUrl || null,
                markdownFile: docData?.markdownFile || null
            }
        };
        
        enrichedCount++;
    }
    
    // Build output
    const output = {
        generatedAt: new Date().toISOString(),
        sourceData: {
            nodesIndexFile: NODES_INDEX_FILE,
            docsMetadataFile: docsMetadata ? DOCS_METADATA_FILE : null,
            totalNodes: nodesIndex.nodes.length,
            nodesWithDocumentation: matchedCount,
            nodesEnriched: enrichedCount
        },
        scanDirectories: nodesIndex.scanDirectories || [],
        nodes: enrichedNodes
    };
    
    // Write output
    const outputDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    console.log('\n✨ Enrichment complete!');
    console.log(`📊 Statistics:`);
    console.log(`   Total nodes: ${enrichedCount}`);
    console.log(`   With documentation: ${matchedCount} (${Math.round(matchedCount / enrichedCount * 100)}%)`);
    console.log(`   Without documentation: ${enrichedCount - matchedCount}`);
    console.log(`💾 Saved to: ${OUTPUT_FILE}`);
    
    // Show some examples of enriched nodes
    console.log('\n🔍 Sample enriched nodes:');
    const sampleNodes = Object.entries(enrichedNodes)
        .filter(([_, node]) => node.metadata.keywordScore > 50)
        .slice(0, 5);
    
    for (const [name, node] of sampleNodes) {
        console.log(`   • ${node.displayName} (${name})`);
        console.log(`     Keywords: ${node.metadata.keywords.slice(0, 8).join(', ')}...`);
        console.log(`     Score: ${node.metadata.keywordScore}`);
    }
}

// Run if called directly
if (require.main === module) {
    enrichNodesIndex().catch(err => {
        console.error('💥 Fatal error:', err);
        process.exit(1);
    });
}

module.exports = { enrichNodesIndex };
