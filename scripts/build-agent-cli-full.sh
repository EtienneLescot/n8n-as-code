#!/bin/bash
# Full build script for agent-cli with enhanced search
# This runs the complete pipeline with proper error handling

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get Node.js path (handle NVM)
get_node_cmd() {
    if command -v node &> /dev/null; then
        echo "node"
    elif [ -f "$HOME/.nvm/versions/node/v22.16.0/bin/node" ]; then
        echo "$HOME/.nvm/versions/node/v22.16.0/bin/node"
    else
        log_error "Node.js not found. Please install Node.js or NVM."
        exit 1
    fi
}

NODE_CMD=$(get_node_cmd)
log_info "Using Node.js: $NODE_CMD"

# Change to project root
cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

log_info "Project root: $PROJECT_ROOT"
echo ""

# Step 1: Ensure n8n cache and build packages
log_info "Step 1/5: Ensuring n8n cache and building packages..."
if $NODE_CMD scripts/ensure-n8n-cache.cjs; then
    log_success "n8n packages built successfully"
else
    log_error "Failed to build n8n packages"
    exit 1
fi
echo ""

# Step 2: Generate basic nodes index
log_info "Step 2/5: Generating nodes index from source..."
if $NODE_CMD scripts/generate-n8n-index.cjs; then
    NODE_COUNT=$($NODE_CMD -e "console.log(JSON.parse(require('fs').readFileSync('packages/agent-cli/src/assets/n8n-nodes-index.json', 'utf8')).nodes.length)")
    log_success "Generated index with $NODE_COUNT nodes"
else
    log_error "Failed to generate nodes index"
    exit 1
fi
echo ""

# Step 3: Download documentation (with timeout)
log_info "Step 3/5: Downloading n8n documentation..."
log_warning "This may take 10-15 minutes (947 documentation pages)..."

# Check if docs already exist
DOCS_DIR="packages/agent-cli/src/assets/n8n-docs-cache"
if [ -d "$DOCS_DIR" ] && [ "$(find "$DOCS_DIR" -name '*.md' | wc -l)" -gt 500 ]; then
    log_warning "Documentation cache already exists with $(find "$DOCS_DIR" -name '*.md' | wc -l) files"
    read -p "Do you want to re-download? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping documentation download"
    else
        rm -rf "$DOCS_DIR"
        if timeout 900 $NODE_CMD scripts/download-n8n-docs.cjs; then
            log_success "Documentation downloaded successfully"
        else
            log_warning "Documentation download timed out or failed (non-critical)"
        fi
    fi
else
    if timeout 900 $NODE_CMD scripts/download-n8n-docs.cjs; then
        log_success "Documentation downloaded successfully"
    else
        log_warning "Documentation download timed out or failed (non-critical)"
        log_info "Enrichment will work with schema-only data"
    fi
fi
echo ""

# Step 4: Enrich nodes index
log_info "Step 4/5: Enriching nodes index with metadata..."
if $NODE_CMD scripts/enrich-nodes-index.cjs; then
    if [ -f "packages/agent-cli/src/assets/n8n-nodes-enriched.json" ]; then
        ENRICHED_COUNT=$($NODE_CMD -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('packages/agent-cli/src/assets/n8n-nodes-enriched.json', 'utf8')).nodes).length)")
        log_success "Enriched index created with $ENRICHED_COUNT nodes"
    else
        log_warning "Enriched index not found, will use basic index"
    fi
else
    log_error "Failed to enrich nodes index"
    exit 1
fi
echo ""

# Step 5: Build TypeScript
log_info "Step 5/5: Building TypeScript and copying assets..."
cd packages/agent-cli

if command -v npm &> /dev/null; then
    if npm run build; then
        log_success "TypeScript compilation successful"
    else
        log_error "TypeScript compilation failed"
        exit 1
    fi
else
    log_error "npm not found"
    exit 1
fi

cd "$PROJECT_ROOT"
echo ""

# Final verification
log_info "Verifying build..."
DIST_INDEX="packages/agent-cli/dist/assets/n8n-nodes-enriched.json"
if [ -f "$DIST_INDEX" ]; then
    log_success "✓ Enriched index copied to dist/"
else
    log_warning "⚠ Enriched index not in dist/ (will use basic index)"
fi

CLI_PATH="packages/agent-cli/dist/cli.js"
if [ -f "$CLI_PATH" ]; then
    log_success "✓ CLI compiled successfully"
else
    log_error "✗ CLI not found"
    exit 1
fi
echo ""

# Test the CLI
log_info "Testing the CLI..."
cd packages/agent-cli

log_info "Testing search 'gemini'..."
if $NODE_CMD dist/cli.js search "gemini" > /tmp/test_gemini.json 2>&1; then
    RESULT_COUNT=$($NODE_CMD -e "try { console.log(JSON.parse(require('fs').readFileSync('/tmp/test_gemini.json', 'utf8')).length || 0) } catch(e) { console.log(0) }")
    if [ "$RESULT_COUNT" -gt 0 ]; then
        log_success "✓ Search 'gemini' returned $RESULT_COUNT results"
    else
        log_warning "⚠ Search 'gemini' returned no results"
    fi
else
    log_warning "⚠ Search test failed (CLI may still work)"
fi

cd "$PROJECT_ROOT"
echo ""

# Final summary
echo "═══════════════════════════════════════════════════════════════"
log_success "🎉 Build Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "   • Basic nodes: $NODE_COUNT"
if [ -n "$ENRICHED_COUNT" ]; then
    echo "   • Enriched nodes: $ENRICHED_COUNT"
fi
echo "   • Documentation files: $(find packages/agent-cli/src/assets/n8n-docs-cache -name '*.md' 2>/dev/null | wc -l)"
echo ""
echo "🚀 Usage:"
echo "   cd packages/agent-cli"
echo "   node dist/cli.js search \"gemini\""
echo "   node dist/cli.js search \"generate image\""
echo "   node dist/cli.js get \"googleGemini\""
echo ""
