# Quick Start Guide - Enhanced Agent CLI

## 🚀 Quick Build & Test

### Option 1: Full Build (Recommended for first time)

```bash
# From project root
cd packages/agent-cli
npm run build
```

This will:
- ✅ Clone/update n8n repository (~5 minutes first time)
- ✅ Build nodes-base and nodes-langchain packages
- ✅ Extract all node schemas (640+ nodes)
- ✅ Download documentation from docs.n8n.io
- ✅ Create enriched search index
- ✅ Compile TypeScript

### Option 2: Incremental Build (Faster for development)

```bash
# Skip documentation download (faster)
cd packages/agent-cli
node ../../scripts/ensure-n8n-cache.cjs
node ../../scripts/generate-n8n-index.cjs
node ../../scripts/enrich-nodes-index.cjs  # Uses schema-only enrichment
npm run build
```

### Option 3: Use Existing Cache

```bash
# If you already have the index files
cd packages/agent-cli
npm run build  # Just TypeScript compilation
```

## 🧪 Testing the Search

### From Command Line

```bash
# After building
cd packages/agent-cli

# Test search commands
node dist/cli.js search "gemini"
node dist/cli.js search "google gemini"
node dist/cli.js search "generate image"
node dist/cli.js search "openai"
node dist/cli.js search "ai"

# Get specific node
node dist/cli.js get "googleGemini"

# List all nodes
node dist/cli.js list | head -50
```

### Expected Results

#### ✅ Search "gemini" should return:
- Google Gemini
- Google Gemini Chat Model
- Embeddings Google Gemini

#### ✅ Search "generate image" should return:
- Google Gemini (with "generate an image" operation)
- OpenAI (with image generation)
- Other image-related nodes

#### ✅ Search "openai" should return:
- OpenAI
- OpenAI Chat Model
- OpenAI Assistant
- Related AI nodes

### From Code

```typescript
import { NodeSchemaProvider } from '@n8n-as-code/agent-cli';

const provider = new NodeSchemaProvider();

// Search
const results = provider.searchNodes('gemini', 10);
console.log('Found:', results.length, 'nodes');
results.forEach(node => {
  console.log(`- ${node.displayName}`);
  console.log(`  Score: ${node.relevanceScore}`);
  console.log(`  Keywords: ${node.keywords?.join(', ')}`);
});

// Get specific node
const schema = provider.getNodeSchema('googleGemini');
console.log('Schema:', schema);
```

## 📊 Verification Checklist

After building, verify:

```bash
# Check files exist
ls -lh packages/agent-cli/src/assets/n8n-nodes-index.json
ls -lh packages/agent-cli/src/assets/n8n-nodes-enriched.json
ls -lh packages/agent-cli/dist/assets/

# Check node count
jq '.nodes | length' packages/agent-cli/src/assets/n8n-nodes-index.json

# Check enriched structure
jq '.nodes | keys | .[0:5]' packages/agent-cli/src/assets/n8n-nodes-enriched.json

# Check for Gemini node
jq '.nodes.googleGemini.metadata' packages/agent-cli/src/assets/n8n-nodes-enriched.json

# Test CLI
cd packages/agent-cli
node dist/cli.js search "gemini" | jq '.[0].displayName'
```

## 🐛 Common Issues

### Issue: "n8n-nodes-index.json not found"
**Solution**: Run the full build pipeline
```bash
cd packages/agent-cli
npm run prebuild
npm run build
```

### Issue: "nodes-langchain not built"
**Solution**: Force rebuild
```bash
FORCE_REBUILD_NODES=true node ../../scripts/ensure-n8n-cache.cjs
node ../../scripts/generate-n8n-index.cjs
```

### Issue: "No results for 'gemini'"
**Solution**: Verify enriched index was created
```bash
ls -lh packages/agent-cli/src/assets/n8n-nodes-enriched.json
# If missing, run:
node ../../scripts/enrich-nodes-index.cjs
```

### Issue: Build takes too long
**Solution**: Use cached build or skip documentation
```bash
# Skip doc download (still works, just less metadata)
node ../../scripts/ensure-n8n-cache.cjs
node ../../scripts/generate-n8n-index.cjs
node ../../scripts/enrich-nodes-index.cjs  # Works without docs
npm run build
```

## 🎯 Find Guides

```bash
./n8n-agent guides "gmail to discord"
```
Quickly find workflow templates and tutorials matching your use case.

## 🎯 What Changed vs Old System

### Before (Old System - ❌ Broken)
```bash
$ npx n8n-agent search "gemini"
[]  # No results!

$ npx n8n-agent search "generate image"
[]  # No results!
```

**Problems:**
- Only scanned nodes-base (522 nodes)
- Missed all nodes-langchain nodes (120 AI nodes)
- Simple substring matching
- No metadata or keywords

### After (New System - ✅ Works!)
```bash
$ npx n8n-agent search "gemini"
[
  {
    "name": "googleGemini",
    "displayName": "Google Gemini",
    "relevanceScore": 1385,
    "keywords": ["ai", "google", "gemini", "image", "video"],
    "operations": ["generate an image", "analyze video", ...]
  },
  ...
]

$ npx n8n-agent search "generate image"
[
  {
    "name": "googleGemini",
    "displayName": "Google Gemini",
    "relevanceScore": 850,
    "operations": ["generate an image", "edit image", ...]
  },
  ...
]
```

**Improvements:**
- ✅ Scans both nodes-base AND nodes-langchain (640+ nodes)
- ✅ Builds nodes-langchain package automatically
- ✅ Smart relevance scoring algorithm
- ✅ Rich metadata: keywords, operations, use cases
- ✅ Documentation integration from docs.n8n.io
- ✅ Multi-word queries work
- ✅ Finds AI nodes reliably

## 📈 Performance

- **First build**: ~5-15 minutes (clones n8n, builds packages, downloads docs)
- **Incremental build**: ~2-5 minutes (uses cache)
- **Search**: <100ms per query
- **Index size**: ~30MB total (20MB enriched + 10MB docs cache)

## 🔄 Daily Usage

Once built, use the CLI:

```bash
# Search (most common)
n8n-agent search "your query"

# Get schema (for code generation)
n8n-agent get "nodeName"

# List all (for discovery)
n8n-agent list | grep -i "keyword"

# Note: You can also use 'npx @n8n-as-code/agent-cli' if not installed globally
```

## 📚 More Info

- See [BUILD_SYSTEM.md](./BUILD_SYSTEM.md) for detailed architecture
- See [README.md](./README.md) for general usage
- See main project docs for integration examples

## ✅ Success Criteria

Your build is successful when:

1. ✅ `n8n-nodes-enriched.json` exists and has 600+ nodes
2. ✅ Search "gemini" returns Google Gemini nodes
3. ✅ Search "generate image" returns nodes with image operations
4. ✅ CLI commands work: `node dist/cli.js search "test"`
5. ✅ No errors in console during search

Happy building! 🚀
