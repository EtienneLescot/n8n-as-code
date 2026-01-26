# 🎉 Skills CLI - Upgrade Guide

## What's New in This Release

### 🆕 Major Improvements

1. **All AI Nodes Now Included** ✅
   - Google Gemini, OpenAI, Anthropic Claude, Cohere, Hugging Face
   - All 120+ LangChain nodes now indexed
   - Total: 640+ nodes (vs 522 before)

2. **Smart Search Algorithm** 🔍
   - Relevance-based scoring
   - Multi-criteria matching (keywords, operations, use cases)
   - Multi-word query support
   - Example: "generate image" now finds the right nodes!

3. **Rich Metadata** 📊
   - Keywords for better discovery
   - Operations list (what each node can do)
   - Use cases and examples
   - Integration with official n8n documentation

4. **Enhanced Index Format** 📁
   - `n8n-nodes-enriched.json` - New comprehensive format
   - Backward compatible with old `n8n-nodes-index.json`
   - Automatic fallback if enriched index unavailable

### 🐛 Bugs Fixed

- ❌ **Before**: Search "gemini" → No results
- ✅ **After**: Search "gemini" → Google Gemini nodes found with high relevance

- ❌ **Before**: Search "generate image" → No results  
- ✅ **After**: Search "generate image" → All image generation nodes

- ❌ **Before**: Only 522 nodes from nodes-base
- ✅ **After**: 640+ nodes including all AI/LangChain nodes

## Migration Guide

### For Existing Users

No breaking changes! The system is backward compatible.

**If you have an existing installation:**

```bash
# 1. Pull latest code
git pull

# 2. Rebuild skills
cd packages/skills
npm run clean
npm run build

# 3. Test the new search
node dist/cli.js search "gemini"
```

### For New Users

```bash
# 1. Clone repo
git clone <repo-url>
cd n8n-as-code

# 2. Install dependencies
npm install

# 3. Build skills (includes all new features)
cd packages/skills
npm run build

# 4. Test it
node dist/cli.js search "google gemini"
```

## Breaking Changes

**None!** The API remains the same:

```typescript
// Old code still works
const provider = new NodeSchemaProvider();
provider.searchNodes('query');
provider.getNodeSchema('nodeName');
provider.listAllNodes();
```

### Enhanced API (Optional)

```typescript
// New optional features
const results = provider.searchNodes('query', 20); // limit parameter

// Results now include additional fields (optional):
results.forEach(node => {
  console.log(node.displayName);
  console.log(node.relevanceScore);  // NEW
  console.log(node.keywords);        // NEW
  console.log(node.operations);      // NEW
  console.log(node.useCases);        // NEW
});
```

## Build Time Impact

### First Build (with cache)
- **Before**: ~3-5 minutes
- **After**: ~5-15 minutes (includes documentation download)

### Subsequent Builds
- **Before**: ~2-3 minutes
- **After**: ~2-5 minutes (uses cached documentation)

### Disk Space
- **Before**: ~16MB index file
- **After**: ~30MB total (20MB enriched index + 10MB docs cache)

## Testing Your Upgrade

Run these commands to verify everything works:

```bash
cd packages/skills

# Test 1: Search for Gemini
node dist/cli.js search "gemini"
# Expected: Should return Google Gemini nodes

# Test 2: Search for image generation
node dist/cli.js search "generate image"
# Expected: Should return nodes with image operations

# Test 3: Get specific node
node dist/cli.js get "googleGemini"
# Expected: Should return full schema for Google Gemini

# Test 4: Verify node count
node dist/cli.js list | wc -l
# Expected: Should show 600+ lines (nodes)
```

## Troubleshooting

### Q: Build fails with "nodes-langchain not found"
**A:** Run force rebuild:
```bash
FORCE_REBUILD_NODES=true node ../../scripts/ensure-n8n-cache.cjs
```

### Q: Search still returns no results for "gemini"
**A:** Verify enriched index exists:
```bash
ls -lh packages/skills/dist/assets/n8n-nodes-enriched.json
# If missing, rebuild:
npm run build
```

### Q: Build takes too long / times out
**A:** Skip documentation download (optional):
```bash
# Edit package.json, remove download-n8n-docs.cjs from prebuild
# Or just wait - only slow on first build
```

### Q: Want to use old behavior
**A:** Disable enriched index:
```typescript
const provider = new NodeSchemaProvider(undefined, false); // Use basic index
```

## What to Expect

### Search Quality Comparison

| Query | Old Results | New Results |
|-------|-------------|-------------|
| "gemini" | ❌ None | ✅ 3 nodes (Google Gemini, Chat Model, Embeddings) |
| "openai" | ⚠️ 1-2 nodes | ✅ 8+ nodes (OpenAI, Chat, Assistants, DALL-E...) |
| "generate image" | ❌ None | ✅ 5+ nodes (Gemini, OpenAI, Stability AI...) |
| "ai assistant" | ❌ None | ✅ 15+ nodes (all AI/LangChain nodes) |
| "google sheets" | ✅ 1 node | ✅ 1 node (still works!) |

## Feedback

If you encounter issues:
1. Check [QUICKSTART.md](./QUICKSTART.md) for common problems
2. Check [BUILD_SYSTEM.md](./BUILD_SYSTEM.md) for technical details
3. Open an issue with your build logs

---

**Enjoy the improved search! 🚀**
