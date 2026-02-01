# Changelog - Skills CLI Enhanced Search

## [Unreleased] - Enhanced Search & Complete Node Coverage

### 🎉 Major Features

#### Complete Node Coverage
- **Added support for @n8n/nodes-langchain package** - All 120+ AI/LangChain nodes now included
  - Google Gemini (with image, video, audio operations)
  - OpenAI (GPT, DALL-E, Whisper, Assistants)
  - Anthropic Claude
  - Cohere
  - Hugging Face
  - All embeddings, chat models, and vector store nodes
- **Total nodes increased from 522 to 640+** (23% increase)
- **Automatic building** of nodes-langchain package during prebuild

#### Enhanced Search Algorithm
- **Relevance-based scoring** - Results ranked by quality, not just substring matching
- **Multi-criteria matching**:
  - Exact name matches (score: 1000)
  - Display name matches (score: 800)
  - Keyword matches (score: 300)
  - Operations matches (score: 100 per match)
  - Use case matches (score: 80 per match)
  - Description matches (score: 100)
- **Multi-word query support** - "generate image" finds nodes with both operations
- **AI node prioritization** - Popular/AI nodes get relevance boost

#### Rich Metadata System
- **Keywords extraction** from node names, descriptions, and documentation
- **Operations list** showing what each node can do (e.g., "generate an image", "analyze video")
- **Use cases** extracted from official n8n templates
- **Documentation URLs** linking to official n8n docs
- **Keyword scoring** to identify high-value nodes

#### Documentation Integration
- **Automatic download** of n8n's official documentation (llms.txt + markdown files)
- **Metadata parsing** from 300+ documentation pages
- **Cached locally** for offline use and fast searches
- **Graceful fallback** - Works without documentation using schema-only enrichment

### 🔧 Technical Improvements

#### Build System
- **New scripts**:
  - `download-n8n-docs.cjs` - Downloads and parses n8n documentation
  - `enrich-nodes-technical.cjs` - Combines schemas with documentation metadata (technical index)
- **Updated scripts**:
  - `ensure-n8n-cache.cjs` - Now builds nodes-langchain package
  - `generate-n8n-index.cjs` - Scans multiple directories (nodes-base + nodes-langchain)
- **New index format**: `n8n-nodes-enriched.json` with comprehensive metadata
- **Backward compatible**: Falls back to `n8n-nodes-index.json` if enriched unavailable

#### API Enhancements
- **Updated `NodeSchemaProvider`**:
  - New constructor parameter: `useEnriched` (default: true)
  - Enhanced `searchNodes()` with relevance scoring and limit parameter
  - Returns enriched results with keywords, operations, useCases, relevanceScore
- **New interfaces**:
  - `IEnrichedNode` - Full enriched node structure
  - Extended `INodeSchemaStub` with optional metadata fields

#### Performance
- **Search speed**: <100ms for typical queries
- **Build time**: 5-15 minutes first build, 2-5 minutes subsequent (with cache)
- **Index size**: ~30MB total (20MB enriched + 10MB docs cache)

### 🐛 Bug Fixes

- **Fixed**: Search for "gemini" returns no results → Now returns Google Gemini nodes
- **Fixed**: Search for "generate image" returns no results → Now returns all image generation nodes
- **Fixed**: AI/LangChain nodes completely missing from index
- **Fixed**: Only 522 nodes indexed (nodes-langchain ignored)
- **Fixed**: Poor search relevance (substring-only matching)

### 📚 Documentation

- **Added** `BUILD_SYSTEM.md` - Complete architecture documentation
- **Added** `QUICKSTART.md` - Quick start guide for building and testing
- **Added** `README_UPGRADE.md` - Migration guide for existing users
- **Updated** main README with enhanced search examples

### 🔄 Breaking Changes

**None!** This release is fully backward compatible.

Existing code continues to work:
```typescript
const provider = new NodeSchemaProvider();
provider.searchNodes('query');  // Returns enhanced results
provider.getNodeSchema('name');
provider.listAllNodes();
```

To disable enriched search (use old behavior):
```typescript
const provider = new NodeSchemaProvider(undefined, false);
```

### 📊 Statistics

**Node Coverage:**
- nodes-base: 522 nodes ✓
- nodes-langchain: 120+ nodes ✓ (NEW!)
- Total: 640+ nodes

**Documentation Coverage:**
- With documentation: ~300 nodes (47%)
- Schema-only: ~340 nodes (53%)
- Total markdown files: 300+

**Search Quality:**
| Query | Old | New |
|-------|-----|-----|
| "gemini" | 0 results | 3 results |
| "openai" | 1-2 results | 8+ results |
| "generate image" | 0 results | 5+ results |
| "ai" | Few results | 50+ results |

### 🚀 Migration

For existing users:
```bash
cd packages/skills
npm run clean
npm run build
```

For new users:
```bash
npm install
cd packages/skills
npm run build
```

See [README_UPGRADE.md](./README_UPGRADE.md) for detailed migration guide.

### 🙏 Acknowledgments

- n8n team for the excellent LLM documentation (llms.txt)
- All contributors to the n8n project

---

**Full Changelog**: [v0.2.1...HEAD]
