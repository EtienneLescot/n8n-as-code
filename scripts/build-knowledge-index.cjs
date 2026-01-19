#!/usr/bin/env node

/**
 * Build Unified Knowledge Index
 * 
 * This script:
 * 1. Loads n8n-docs-complete.json (documentation)
 * 2. Loads n8n-nodes-technical.json (nodes)
 * 3. Creates unified search index
 * 4. Calculates relevance scores
 * 5. Generates n8n-knowledge-index.json (optimized for fast search)
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Configuration
const DOCS_COMPLETE_FILE = path.join(__dirname, '../packages/agent-cli/src/assets/n8n-docs-complete.json');
const NODES_TECHNICAL_FILE = path.join(__dirname, '../packages/agent-cli/src/assets/n8n-nodes-technical.json');
const OUTPUT_FILE = path.join(__dirname, '../packages/agent-cli/src/assets/n8n-knowledge-index.json');

/**
 * Build search entry for a documentation page
 */
function buildDocSearchEntry(page) {
    return {
        type: 'documentation',
        id: page.id,
        title: page.title,
        url: page.url,
        category: page.category,
        subcategory: page.subcategory,
        excerpt: page.content.excerpt,
        
        searchTerms: [
            ...page.metadata.keywords,
            ...page.searchIndex.importantTerms,
            page.title.toLowerCase()
        ].filter((v, i, a) => a.indexOf(v) === i), // unique
        
        metadata: {
            complexity: page.metadata.complexity,
            readingTime: page.metadata.readingTime,
            hasCodeExamples: page.metadata.codeExamples > 0,
            useCasesCount: page.metadata.useCases.length
        },
        
        score: calculateDocScore(page)
    };
}

/**
 * Calculate relevance score for documentation
 */
function calculateDocScore(page) {
    let score = 5.0; // Base score
    
    // Boost for categories
    const categoryBoosts = {
        'integrations': 2.0,
        'advanced-ai': 1.5,
        'tutorials': 1.5,
        'code': 1.0,
        'concepts': 1.0
    };
    score += categoryBoosts[page.category] || 0;
    
    // Boost for content quality
    if (page.metadata.useCases.length > 0) score += 1.0;
    if (page.metadata.codeExamples > 0) score += 0.5;
    if (page.metadata.contentLength > 2000) score += 0.5;
    
    // Boost for node-specific docs
    if (page.nodeName) score += 2.0;
    
    return Math.round(score * 10) / 10;
}

/**
 * Build search entry for a node
 */
function buildNodeSearchEntry(nodeName, node) {
    const operations = node.metadata?.operations || [];
    const keywords = node.metadata?.keywords || [];
    const useCases = node.metadata?.useCases || [];
    const properties = node.schema?.properties || [];

    return {
        type: 'node',
        name: nodeName,
        displayName: node.displayName || nodeName,
        description: node.description || '',
        category: node.group?.[0] || 'other',
        
        searchTerms: [
            nodeName.toLowerCase(),
            (node.displayName || nodeName).toLowerCase(),
            ...(node.description || '').toLowerCase().split(/\s+/).filter(w => w.length > 3),
            ...(node.group || []).map(g => g.toLowerCase()),
            ...keywords,
            ...operations,
            ...useCases
        ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 100), // unique, limit
        
        metadata: {
            hasDocumentation: node.metadata?.hasDocumentation || false,
            hasExamples: useCases.length > 0,
            operationsCount: operations.length,
            propertiesCount: properties.length
        },
        
        documentation: {
            mainPage: node.metadata?.markdownUrl || null,
            examplesCount: useCases.length
        },
        
        score: calculateNodeScore(node)
    };
}

/**
 * Calculate relevance score for node
 */
function calculateNodeScore(node) {
    let score = 7.0; // Base score (nodes are important)
    
    // Boost for documentation
    if (node.metadata?.hasDocumentation) score += 2.0;
    if (node.metadata?.useCases?.length > 0) score += 1.0;
    
    // Boost for completeness
    const propertiesCount = node.schema?.properties?.length || 0;
    if (propertiesCount > 10) score += 0.5;
    
    const operationsCount = node.metadata?.operations?.length || 0;
    if (operationsCount > 0) score += 0.5;
    
    // Boost for common groups
    const groupBoosts = {
        'input': 1.5,
        'output': 1.0,
        'transform': 1.0
    };
    const group = node.group?.[0];
    if (group) score += groupBoosts[group] || 0;
    
    // Keyword score boost
    if (node.metadata?.keywordScore) {
        score += Math.min(node.metadata.keywordScore / 10, 2);
    }
    
    return Math.round(score * 10) / 10;
}

/**
 * Build keyword index
 */
function buildKeywordIndex(entries) {
    const index = {};
    
    for (const entry of entries) {
        for (const term of entry.searchTerms) {
            if (!index[term]) {
                index[term] = [];
            }
            index[term].push({
                type: entry.type,
                id: entry.type === 'node' ? entry.name : entry.id,
                score: entry.score
            });
        }
    }
    
    // Sort by score within each keyword
    for (const term in index) {
        index[term].sort((a, b) => b.score - a.score);
    }
    
    return index;
}

/**
 * Build category index
 */
function buildCategoryIndex(entries) {
    const index = {
        documentation: {},
        nodes: {}
    };
    
    for (const entry of entries) {
        if (entry.type === 'documentation') {
            const cat = entry.category;
            if (!index.documentation[cat]) {
                index.documentation[cat] = [];
            }
            index.documentation[cat].push(entry.id);
        } else if (entry.type === 'node') {
            const cat = entry.category;
            if (!index.nodes[cat]) {
                index.nodes[cat] = [];
            }
            index.nodes[cat].push(entry.name);
        }
    }
    
    return index;
}

/**
 * Build quick lookup index
 */
function buildQuickLookup(nodes, docs) {
    const lookup = {
        nodeByName: {},
        docById: {},
        docByNodeName: {}
    };
    
    // Index nodes
    for (const entry of nodes) {
        lookup.nodeByName[entry.name] = entry;
    }
    
    // Index docs
    for (const entry of docs) {
        lookup.docById[entry.id] = entry;
        
        // Index by node name if applicable
        const page = docs.find(d => d.id === entry.id);
        if (page && page.nodeName) {
            if (!lookup.docByNodeName[page.nodeName]) {
                lookup.docByNodeName[page.nodeName] = [];
            }
            lookup.docByNodeName[page.nodeName].push(entry.id);
        }
    }
    
    return lookup;
}

/**
 * Calculate suggestions based on common searches
 */
function buildSuggestions(entries) {
    const suggestions = {
        popular: [],
        categories: {},
        byComplexity: {
            beginner: [],
            intermediate: [],
            advanced: []
        }
    };
    
    // Top scored entries
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    suggestions.popular = sorted.slice(0, 20).map(e => ({
        type: e.type,
        id: e.type === 'node' ? e.name : e.id,
        title: e.type === 'node' ? e.displayName : e.title,
        score: e.score
    }));
    
    // By category
    for (const entry of entries) {
        const cat = entry.category;
        if (!suggestions.categories[cat]) {
            suggestions.categories[cat] = [];
        }
        if (suggestions.categories[cat].length < 10) {
            suggestions.categories[cat].push({
                type: entry.type,
                id: entry.type === 'node' ? entry.name : entry.id,
                title: entry.type === 'node' ? entry.displayName : entry.title
            });
        }
    }
    
    // By complexity (docs only)
    for (const entry of entries) {
        if (entry.type === 'documentation' && entry.metadata.complexity) {
            const complexity = entry.metadata.complexity;
            if (suggestions.byComplexity[complexity].length < 10) {
                suggestions.byComplexity[complexity].push({
                    id: entry.id,
                    title: entry.title
                });
            }
        }
    }
    
    return suggestions;
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 n8n Knowledge Index Builder');
    console.log('===============================\n');
    
    try {
        // Load documentation
        console.log('📥 Loading complete documentation...');
        const docsComplete = JSON.parse(await readFile(DOCS_COMPLETE_FILE, 'utf-8'));
        console.log(`✅ Loaded ${docsComplete.totalPages} documentation pages`);
        
        // Load nodes
        console.log('\n📥 Loading technical nodes...');
        const nodesTechnical = JSON.parse(await readFile(NODES_TECHNICAL_FILE, 'utf-8'));
        const nodesCount = Object.keys(nodesTechnical.nodes).length;
        console.log(`✅ Loaded ${nodesCount} nodes`);
        
        // Build search entries for docs
        console.log('\n🔍 Building search entries for documentation...');
        const docEntries = docsComplete.pages.map(page => buildDocSearchEntry(page));
        console.log(`✅ Built ${docEntries.length} doc entries`);
        
        // Build search entries for nodes
        console.log('\n🔍 Building search entries for nodes...');
        const nodeEntries = Object.entries(nodesTechnical.nodes).map(([name, node]) => 
            buildNodeSearchEntry(name, node)
        );
        console.log(`✅ Built ${nodeEntries.length} node entries`);
        
        // Combine all entries
        const allEntries = [...docEntries, ...nodeEntries];
        console.log(`\n📊 Total search entries: ${allEntries.length}`);
        
        // Build keyword index
        console.log('\n🗂️  Building keyword index...');
        const keywordIndex = buildKeywordIndex(allEntries);
        console.log(`✅ Indexed ${Object.keys(keywordIndex).length} keywords`);
        
        // Build category index
        console.log('\n🗂️  Building category index...');
        const categoryIndex = buildCategoryIndex(allEntries);
        console.log('✅ Category index built');
        
        // Build quick lookup
        console.log('\n⚡ Building quick lookup index...');
        const quickLookup = buildQuickLookup(nodeEntries, docEntries);
        console.log('✅ Quick lookup built');
        
        // Build suggestions
        console.log('\n💡 Building suggestions...');
        const suggestions = buildSuggestions(allEntries);
        console.log('✅ Suggestions built');
        
        // Generate knowledge index
        const knowledgeIndex = {
            generatedAt: new Date().toISOString(),
            version: '1.0.0',
            
            statistics: {
                totalEntries: allEntries.length,
                documentation: docEntries.length,
                nodes: nodeEntries.length,
                keywords: Object.keys(keywordIndex).length,
                avgScoreDoc: Math.round(docEntries.reduce((sum, e) => sum + e.score, 0) / docEntries.length * 10) / 10,
                avgScoreNode: Math.round(nodeEntries.reduce((sum, e) => sum + e.score, 0) / nodeEntries.length * 10) / 10
            },
            
            entries: {
                documentation: docEntries,
                nodes: nodeEntries
            },
            
            indexes: {
                byKeyword: keywordIndex,
                byCategory: categoryIndex,
                quickLookup
            },
            
            suggestions
        };
        
        // Write to file
        console.log('\n💾 Writing knowledge index...');
        await writeFile(OUTPUT_FILE, JSON.stringify(knowledgeIndex, null, 2));
        console.log('✅ Knowledge index written');
        
        // Summary
        console.log('\n📊 Summary:');
        console.log(`   Total entries: ${knowledgeIndex.statistics.totalEntries}`);
        console.log(`   Documentation: ${knowledgeIndex.statistics.documentation}`);
        console.log(`   Nodes: ${knowledgeIndex.statistics.nodes}`);
        console.log(`   Keywords indexed: ${knowledgeIndex.statistics.keywords}`);
        console.log(`   Avg score (docs): ${knowledgeIndex.statistics.avgScoreDoc}`);
        console.log(`   Avg score (nodes): ${knowledgeIndex.statistics.avgScoreNode}`);
        console.log(`   File size: ${(JSON.stringify(knowledgeIndex).length / 1024 / 1024).toFixed(2)} MB`);
        
        console.log('\n✨ Complete! Knowledge index built successfully.');
        console.log(`   Output file: ${OUTPUT_FILE}`);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main };
