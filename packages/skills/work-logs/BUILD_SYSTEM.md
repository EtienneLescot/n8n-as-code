# Skills CLI - Enhanced Build System Documentation

## 🎯 Overview

The skills package now features an **enhanced build system** that creates a rich, searchable index of n8n nodes by combining:

1. **Technical schemas** from n8n source code (nodes-base + nodes-langchain)
2. **Human-readable documentation** from n8n's public docs (llms.txt)
3. **Intelligent search scoring** based on keywords, operations, and use cases

This system solves the problem where AI-related nodes (Google Gemini, OpenAI, etc.) were missing from the index.

## 📦 What Gets Generated

### Files Created During Build

```
packages/skills/src/assets/
├── n8n-nodes-index.json          # Basic technical schemas (522+ nodes from nodes-base)
├── n8n-nodes-enriched.json       # ENHANCED index with metadata (ALL nodes including LangChain)
└── n8n-docs-cache/
    ├── llms.txt                   # Original n8n LLM documentation index
    ├── docs-metadata.json         # Parsed metadata from all .md files
    └── *.md                       # Individual node documentation files
```

### Enhanced Node Structure

Each node in `n8n-nodes-enriched.json` contains:

```json
{
  "googleGemini": {
    "name": "googleGemini",
    "displayName": "Google Gemini",
    "description": "Work with Google Gemini",
    "version": 1,
    "group": ["AI"],
    "icon": "file:googleGemini.svg",
    "schema": {
      "properties": [...],
      "sourcePath": "/.n8n-cache/packages/@n8n/nodes-langchain/dist/..."
    },
    "metadata": {
      "keywords": ["ai", "google", "gemini", "image", "video", "generate", "analyze", "llm"],
      "operations": [
        "analyze audio",
        "transcribe a recording",
        "analyze document",
        "generate an image",
        "analyze video"
      ],
      "useCases": [
        "automate multi-platform social media content creation with ai",
        "ai-powered social media content generator"
      ],
      "keywordScore": 185,
      "hasDocumentation": true,
      "markdownUrl": "https://docs.n8n.io/integrations/builtin/app-nodes/...",
      "markdownFile": "google_gemini.md"
    }
  }
}
```

## 🔧 Build Pipeline

### Automatic Build (Recommended)

```bash
cd packages/skills
npm run build
```

This runs the complete pipeline:
1. `ensure-n8n-cache.cjs` - Clones/updates n8n repo and builds both packages
2. `generate-n8n-index.cjs` - Extracts technical schemas from built packages
3. `download-n8n-docs.cjs` - Downloads documentation from n8n docs
4. `enrich-nodes-technical.cjs` - Combines schemas with documentation metadata into the technical index
5. TypeScript compilation
6. Asset copying to dist/

### Manual Build Steps

```bash
# Step 1: Ensure n8n cache and build packages
node scripts/ensure-n8n-cache.cjs

# Step 2: Generate basic index from nodes-base + nodes-langchain
node scripts/generate-n8n-index.cjs

# Step 3: Download n8n documentation (optional but recommended)
node scripts/download-n8n-docs.cjs

# Step 4: Create enriched index with metadata
node scripts/enrich-nodes-technical.cjs

# Step 5: Build TypeScript
cd packages/skills
npm run build
```

## 🔍 Enhanced Search Algorithm

The new `NodeSchemaProvider.searchNodes()` uses relevance scoring:

### Scoring Breakdown

| Match Type | Score | Example |
|------------|-------|---------|
| Exact name match | 1000 | `googleGemini` → "googleGemini" |
| Exact display name | 800 | `Google Gemini` → "Google Gemini" |
| Name contains query | 500 | `gemini` → "googleGemini" |
| Display name contains | 400 | `gemini` → "Google Gemini" |
| Keyword exact match | 300 | `gemini` in keywords |
| Operation match | 100/each | `generate image` in operations |
| Use case match | 80/each | `ai content` in use cases |
| Description contains | 100 | `gemini` in description |
| AI/Popular node bonus | +50-100 | High keywordScore nodes |

### Usage Examples

```typescript
import { NodeSchemaProvider } from '@n8n-as-code/skills';

const provider = new NodeSchemaProvider();

// Search with new relevance scoring
const results = provider.searchNodes('gemini');
// Returns: Google Gemini nodes (high relevance)

const imageResults = provider.searchNodes('generate image');
// Returns: Google Gemini, OpenAI DALL-E, etc.

const aiResults = provider.searchNodes('ai assistant');
// Returns: All AI-related nodes sorted by relevance
```

### CLI Usage

```bash
# Search for nodes
npx n8nac skills search "gemini"
npx n8nac skills search "generate image"
npx n8nac skills search "openai"

# Get specific node schema
npx n8nac skills node-info "googleGemini"

# List all nodes
npx n8nac skills list
```

## 🎨 Improved Results

### Before (Old System)
```bash
$ npx n8nac skills search "gemini"
# No results found!
```

### After (Enhanced System)
```bash
$ npx n8nac skills search "gemini"
[
  {
    "name": "googleGemini",
    "displayName": "Google Gemini",
    "description": "Work with Google Gemini",
    "keywords": ["ai", "google", "gemini", "image", "video", "generate"],
    "operations": ["analyze audio", "generate an image", "analyze video"],
    "relevanceScore": 1385
  },
  {
    "name": "lmChatGoogleGemini",
    "displayName": "Google Gemini Chat Model",
    "keywords": ["ai", "google", "gemini", "chat", "llm"],
    "relevanceScore": 980
  }
]
```

## 🚀 Performance

- **Build time**: ~5-15 minutes (first time, includes cloning n8n)
- **Subsequent builds**: ~2-5 minutes (uses cached n8n)
- **Search time**: <100ms for typical queries
- **Index size**: ~20-30MB (enriched), ~16MB (basic)
- **Documentation cache**: ~5-10MB

## 🐛 Troubleshooting

### "No nodes found"
```bash
# Rebuild the index
cd packages/skills
npm run clean
npm run build
```

### "nodes-langchain not found"
```bash
# Force rebuild n8n packages
FORCE_REBUILD_NODES=true node scripts/ensure-n8n-cache.cjs
```

### "Documentation download failed"
- The system will work without documentation (using schema-only enrichment)
- Check internet connection
- Documentation is optional but improves search quality

### "Module resolution errors during index generation"
- Ensure pnpm is installed: `npm install -g pnpm`
- Run from project root: `node scripts/ensure-n8n-cache.cjs`

## 📊 Statistics

From a typical build:
- **nodes-base**: ~520 nodes
- **nodes-langchain**: ~120 nodes (AI/LangChain)
- **Total nodes**: ~640 nodes
- **With documentation**: ~300 nodes (47%)
- **High-value AI nodes**: ~50 nodes

## 🔄 Maintenance

### Updating to New n8n Version

Edit `scripts/ensure-n8n-cache.cjs`:
```javascript
const N8N_STABLE_TAG = 'n8n@1.74.2'; // Change this
```

Then rebuild:
```bash
FORCE_REBUILD_NODES=true npm run build --workspace=@n8n-as-code/skills
```

### Refreshing Documentation

```bash
# Delete cached docs
rm -rf packages/skills/src/assets/n8n-docs-cache

# Re-download
node scripts/download-n8n-docs.cjs
node scripts/enrich-nodes-technical.cjs
```

## 🎯 Key Improvements

1. ✅ **All nodes included**: nodes-base + nodes-langchain (640+ total)
2. ✅ **AI nodes discoverable**: Google Gemini, OpenAI, Anthropic, etc.
3. ✅ **Better search**: Multi-criteria relevance scoring
4. ✅ **Rich metadata**: Keywords, operations, use cases
5. ✅ **Documentation included**: Human-readable descriptions
6. ✅ **Backward compatible**: Falls back to basic index if enriched not available
7. ✅ **Build-time processing**: No runtime HTTP requests

## 📝 Next Steps

To use the enhanced search in your AI agents:

1. **Update skills**: `npm update @n8n-as-code/skills`
2. **Rebuild your project**: `npm run build`
3. **Use improved search**: Queries like "generate image", "gemini", "ai assistant" now work!

For questions or issues, please refer to the main README or open an issue.
