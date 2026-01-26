#!/usr/bin/env node

/**
 * Build Complete Documentation Index
 * 
 * This script:
 * 1. Loads metadata.json from download-complete-docs.cjs
 * 2. Loads all markdown pages
 * 3. Extracts sections, code examples, related content
 * 4. Builds semantic relationships between pages
 * 5. Generates n8n-docs-complete.json with full content + structure
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

// Configuration
const CACHE_DIR = path.join(__dirname, '../packages/skills/src/assets/n8n-docs-cache');
const METADATA_FILE = path.join(CACHE_DIR, 'metadata.json');
const OUTPUT_FILE = path.join(__dirname, '../packages/skills/src/assets/n8n-docs-complete.json');

/**
 * Parse markdown content into sections
 */
function parseMarkdownSections(content) {
    const sections = [];
    const lines = content.split('\n');

    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
        // Detect headers (# Header)
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headerMatch) {
            // Save previous section
            if (currentSection) {
                currentSection.content = currentContent.join('\n').trim();
                sections.push(currentSection);
            }

            // Start new section
            const level = headerMatch[1].length;
            const title = headerMatch[2].trim();
            currentSection = {
                level,
                title,
                content: '',
                subsections: []
            };
            currentContent = [];
        } else if (currentSection) {
            currentContent.push(line);
        }
    }

    // Save last section
    if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
    }

    // Build hierarchy
    const hierarchy = buildSectionHierarchy(sections);

    return hierarchy;
}

/**
 * Build hierarchical structure from flat sections
 */
function buildSectionHierarchy(sections) {
    const root = [];
    const stack = [{ level: 0, subsections: root }];

    for (const section of sections) {
        // Pop stack until we find the parent level
        while (stack.length > 1 && stack[stack.length - 1].level >= section.level) {
            stack.pop();
        }

        const parent = stack[stack.length - 1];
        parent.subsections.push(section);
        stack.push(section);
    }

    return root;
}

/**
 * Extract code examples from markdown
 */
function extractCodeExamples(content) {
    const examples = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1] || 'text';
        const code = match[2].trim();

        if (code.length > 10) {
            examples.push({
                language,
                code: code.substring(0, 2000) // Limit size
            });
        }
    }

    return examples;
}

/**
 * Extract operations from node documentation
 */
function extractOperations(content) {
    const operations = new Set();

    // Look for operation lists
    const operationPatterns = [
        /(?:operation|action)s?:\s*(.+?)(?:\n|$)/gi,
        /supports? the following (?:operation|action)s?:\s*(.+?)(?:\n|$)/gi,
        /you can:\s*(.+?)(?:\n|$)/gi,
    ];

    for (const pattern of operationPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
            const ops = match[1].split(/,|and|\||\//).map(s => s.trim().toLowerCase());
            ops.forEach(op => {
                if (op.length > 2 && op.length < 50) {
                    operations.add(op);
                }
            });
        }
    }

    // Look for operation headings
    const headerMatches = content.matchAll(/^#{2,4}\s+(.+?)(?:\n|$)/gm);
    for (const match of headerMatches) {
        const title = match[1].toLowerCase();
        if (title.includes('operation') || title.includes('action')) {
            operations.add(title.replace(/operations?|actions?/gi, '').trim());
        }
    }

    return Array.from(operations).slice(0, 20);
}

/**
 * Find related pages based on content similarity
 */
function findRelatedPages(currentPage, allPages) {
    const related = [];
    const currentKeywords = new Set(currentPage.keywords);

    for (const page of allPages) {
        if (page.id === currentPage.id) continue;

        // Calculate keyword overlap
        const pageKeywords = new Set(page.keywords);
        const intersection = new Set([...currentKeywords].filter(k => pageKeywords.has(k)));
        const overlap = intersection.size / Math.max(currentKeywords.size, pageKeywords.size);

        if (overlap > 0.2) { // 20% overlap
            related.push({
                id: page.id,
                title: page.title,
                category: page.category,
                overlap: Math.round(overlap * 100) / 100
            });
        }
    }

    // Sort by overlap and return top 10
    return related
        .sort((a, b) => b.overlap - a.overlap)
        .slice(0, 10)
        .map(({ id, title, category }) => ({ id, title, category }));
}

/**
 * Calculate complexity score
 */
function calculateComplexity(content, sections) {
    let score = 0;

    // Based on content length
    if (content.length > 5000) score += 2;
    else if (content.length > 2000) score += 1;

    // Based on sections depth
    if (sections.length > 10) score += 2;
    else if (sections.length > 5) score += 1;

    // Based on technical terms
    const technicalTerms = ['api', 'authentication', 'oauth', 'webhook', 'expression', 'function', 'advanced'];
    const technicalCount = technicalTerms.filter(term =>
        content.toLowerCase().includes(term)
    ).length;

    if (technicalCount >= 4) score += 2;
    else if (technicalCount >= 2) score += 1;

    // Map to complexity level
    if (score <= 2) return 'beginner';
    if (score <= 4) return 'intermediate';
    return 'advanced';
}

/**
 * Estimate reading time
 */
function estimateReadingTime(content) {
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return `${minutes} min`;
}

/**
 * Build search index for a page
 */
function buildSearchIndex(page, content, sections) {
    // Full text for search
    const fullText = [
        page.title,
        content,
        sections.map(s => s.title).join(' ')
    ].join(' ').toLowerCase();

    // Extract important terms (appearing multiple times)
    const words = fullText.match(/\b[a-z]{4,}\b/g) || [];
    const wordFreq = {};
    words.forEach(word => {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    const importantTerms = Object.entries(wordFreq)
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word]) => word);

    return {
        fullText: fullText.substring(0, 10000), // Limit size
        importantTerms
    };
}

/**
 * Process a single page
 */
async function processPage(pageMeta, pagesDir) {
    try {
        const pagePath = path.join(CACHE_DIR, pageMeta.filePath);
        const content = await readFile(pagePath, 'utf-8');

        // Parse content
        const sections = parseMarkdownSections(content);
        const codeExamples = extractCodeExamples(content);
        const operations = extractOperations(content);
        const complexity = calculateComplexity(content, sections);
        const readingTime = estimateReadingTime(content);
        const searchIndex = buildSearchIndex(pageMeta, content, sections);

        return {
            id: pageMeta.id,
            title: pageMeta.title,
            url: pageMeta.url,
            urlPath: pageMeta.urlPath,
            category: pageMeta.category,
            subcategory: pageMeta.subcategory,
            nodeName: pageMeta.nodeName,
            nodeType: pageMeta.nodeName ? `n8n-nodes-base.${pageMeta.nodeName}` : null,

            content: {
                markdown: content,
                excerpt: content.substring(0, 500).replace(/\n/g, ' ').trim() + '...',
                sections: sections.map(s => ({
                    title: s.title,
                    level: s.level,
                    content: s.content.substring(0, 1000) // Limit section content
                }))
            },

            metadata: {
                keywords: pageMeta.keywords,
                useCases: pageMeta.useCases,
                operations,
                codeExamples: codeExamples.length,
                complexity,
                readingTime,
                contentLength: content.length
            },

            searchIndex
        };
    } catch (error) {
        console.error(`   ❌ Failed to process ${pageMeta.id}: ${error.message}`);
        return null;
    }
}

/**
 * Build categories structure
 */
function buildCategoriesStructure(pages) {
    const categories = {};

    for (const page of pages) {
        if (!categories[page.category]) {
            categories[page.category] = {
                description: getCategoryDescription(page.category),
                totalPages: 0,
                pages: []
            };
        }

        categories[page.category].totalPages++;
        categories[page.category].pages.push(page.id);
    }

    return categories;
}

/**
 * Get category description
 */
function getCategoryDescription(category) {
    const descriptions = {
        integrations: 'Node integrations and app-specific documentation',
        credentials: 'Authentication and credentials setup guides',
        triggers: 'Trigger nodes for workflow activation',
        'core-nodes': 'Core n8n nodes (logic, data manipulation, etc.)',
        'advanced-ai': 'AI agents, chains, RAG, memory, and LangChain integration',
        code: 'Code node, expressions, and built-in methods',
        tutorials: 'Step-by-step guides and learning resources',
        concepts: 'Workflow concepts, patterns, and best practices',
        hosting: 'Self-hosting, deployment, and infrastructure',
        api: 'n8n API documentation and usage',
        other: 'General documentation and guides'
    };

    return descriptions[category] || 'Documentation pages';
}

/**
 * Build search indexes
 */
function buildGlobalSearchIndexes(pages) {
    const byKeyword = {};
    const byCategory = {};
    const byNodeName = {};

    for (const page of pages) {
        // Index by keywords
        for (const keyword of page.metadata.keywords) {
            if (!byKeyword[keyword]) {
                byKeyword[keyword] = [];
            }
            byKeyword[keyword].push(page.id);
        }

        // Index by category
        if (!byCategory[page.category]) {
            byCategory[page.category] = [];
        }
        byCategory[page.category].push(page.id);

        // Index by node name
        if (page.nodeName) {
            if (!byNodeName[page.nodeName]) {
                byNodeName[page.nodeName] = [];
            }
            byNodeName[page.nodeName].push(page.id);
        }
    }

    return { byKeyword, byCategory, byNodeName };
}

/**
 * Main execution
 */
async function main() {
    console.log('🚀 n8n Complete Documentation Indexer');
    console.log('=====================================\n');

    try {
        // Load metadata
        console.log('📥 Loading metadata...');
        const metadata = JSON.parse(await readFile(METADATA_FILE, 'utf-8'));
        const pagesMeta = Object.values(metadata.pages);
        console.log(`✅ Loaded metadata for ${pagesMeta.length} pages`);

        // Process all pages
        console.log('\n📄 Processing pages...');
        const processedPages = [];

        for (let i = 0; i < pagesMeta.length; i++) {
            const pageMeta = pagesMeta[i];
            const page = await processPage(pageMeta, CACHE_DIR);

            if (page) {
                processedPages.push(page);
            }

            if ((i + 1) % 100 === 0) {
                console.log(`   Processed ${i + 1}/${pagesMeta.length} pages...`);
            }
        }

        console.log(`✅ Processed ${processedPages.length} pages successfully`);

        // Find related pages for each page
        console.log('\n🔗 Building relationships...');
        for (const page of processedPages) {
            page.metadata.relatedPages = findRelatedPages(page, processedPages);
        }
        console.log('✅ Relationships built');

        // Build categories structure
        console.log('\n📊 Building categories structure...');
        const categories = buildCategoriesStructure(processedPages);
        console.log('✅ Categories structured');

        // Build search indexes
        console.log('\n🔍 Building search indexes...');
        const searchIndex = buildGlobalSearchIndexes(processedPages);
        console.log('✅ Search indexes built');

        // Generate complete index
        const completeIndex = {
            generatedAt: new Date().toISOString(),
            version: '1.0.0',
            sourceUrl: 'https://docs.n8n.io/llms.txt',
            totalPages: processedPages.length,

            statistics: {
                byCategory: Object.entries(categories).reduce((acc, [cat, data]) => {
                    acc[cat] = data.totalPages;
                    return acc;
                }, {}),
                withNodeNames: processedPages.filter(p => p.nodeName).length,
                withUseCases: processedPages.filter(p => p.metadata.useCases.length > 0).length,
                withCodeExamples: processedPages.filter(p => p.metadata.codeExamples > 0).length
            },

            categories,

            pages: processedPages,

            searchIndex
        };

        // Write to file
        console.log('\n💾 Writing complete index...');
        await writeFile(OUTPUT_FILE, JSON.stringify(completeIndex, null, 2));
        console.log('✅ Complete index written');

        // Summary
        console.log('\n📊 Summary:');
        console.log(`   Total pages: ${completeIndex.totalPages}`);
        console.log(`   By category:`, completeIndex.statistics.byCategory);
        console.log(`   With node names: ${completeIndex.statistics.withNodeNames}`);
        console.log(`   With use cases: ${completeIndex.statistics.withUseCases}`);
        console.log(`   With code examples: ${completeIndex.statistics.withCodeExamples}`);
        console.log(`   File size: ${(JSON.stringify(completeIndex).length / 1024 / 1024).toFixed(2)} MB`);

        console.log('\n✨ Complete! Documentation indexed successfully.');
        console.log(`   Output file: ${OUTPUT_FILE}`);

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
