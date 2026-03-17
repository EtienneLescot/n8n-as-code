#!/usr/bin/env node

/**
 * Build Script for generated skill adapters (@n8n-as-code/skills)
 * 
 * Generates the distributable Claude Agent Skill package and mirrors the
 * generated skill files into plugin trees that consume the same SSOT.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');

// Dynamically import AiContextGenerator from compiled dist
async function getAiContextGenerator() {
    const distPath = path.resolve(__dirname, '..', 'dist', 'services', 'ai-context-generator.js');
    if (!fs.existsSync(distPath)) {
        throw new Error('AiContextGenerator not found in dist/. Please run "npm run build" from the workspace root first.');
    }
    const mod = await import(distPath);
    return new mod.AiContextGenerator();
}

// Root of the skills package
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist', 'adapters', 'claude');
const SKILL_OUTPUT_DIR = path.join(DIST_DIR, 'n8n-architect');
const CLAUDE_PLUGIN_SKILL_DIR = path.join(WORKSPACE_ROOT, 'plugins', 'claude', 'n8n-as-code', 'skills', 'n8n-architect');
const OPENCLAW_PLUGIN_SKILL_DIR = path.join(WORKSPACE_ROOT, 'plugins', 'openclaw', 'n8n-as-code', 'skills', 'n8n-architect');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    red: '\x1b[31m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function cleanDist() {
    log('\n🧹 Cleaning dist directory...', 'blue');
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });
    log('   ✓ Cleaned', 'green');
}

function createSkillStructure() {
    log('\n📁 Creating skill directory structure...', 'blue');

    // Create main skill directory
    fs.mkdirSync(SKILL_OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(CLAUDE_PLUGIN_SKILL_DIR, { recursive: true });
    fs.mkdirSync(OPENCLAW_PLUGIN_SKILL_DIR, { recursive: true });

    // Create scripts subdirectory
    const scriptsDir = path.join(SKILL_OUTPUT_DIR, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    log('   ✓ Structure created', 'green');
}

async function generateSkillMd() {
    log('\n📄 Generating SKILL.md from AiContextGenerator...', 'blue');

    const generator = await getAiContextGenerator();
    const skillContent = generator.getSkillContent();
    const openClawSkillContent = generator.getOpenClawSkillContent();
    const distPath = path.join(SKILL_OUTPUT_DIR, 'SKILL.md');
    const claudePluginPath = path.join(CLAUDE_PLUGIN_SKILL_DIR, 'SKILL.md');
    const openClawPluginPath = path.join(OPENCLAW_PLUGIN_SKILL_DIR, 'SKILL.md');

    fs.writeFileSync(distPath, skillContent);
    fs.writeFileSync(claudePluginPath, skillContent);
    fs.writeFileSync(openClawPluginPath, openClawSkillContent);
    log('   ✓ SKILL.md generated for dist, Claude plugin, and OpenClaw plugin', 'green');
}

function generateReadme() {
    log('\n📝 Generating installation README...', 'blue');

    const readme = `# n8n Architect - Claude Agent Skill

Welcome! You've downloaded the official n8n workflow development skill for Claude.

## 🚀 Quick Installation

### For Claude.ai

1. In Claude.ai, go to **Settings → Features**
2. Under "Custom Skills", click **Upload Skill**
3. Upload the \`n8n-architect\` folder as a ZIP file
4. Done! Claude will now use this skill automatically when discussing n8n workflows

### For Claude Code

1. Copy the \`n8n-architect/\` folder to your project:
   \`\`\`bash
   cp -r n8n-architect /path/to/your/project/.claude/skills/
   \`\`\`

2. Or install globally:
   \`\`\`bash
   cp -r n8n-architect ~/.claude/skills/
   \`\`\`

3. Claude Code will auto-discover the skill

### For Claude Desktop / MCP

Use the local MCP server exposed by \`n8nac\`:

\`\`\`json
{
  "mcpServers": {
    "n8n-as-code": {
      "command": "npx",
      "args": ["--yes", "n8nac", "skills", "mcp"]
    }
  }
}
\`\`\`

If you want Claude Desktop to resolve \`n8nac-config.json\` and any custom node sidecars from a specific project, also set \`N8N_AS_CODE_PROJECT_DIR\` in the server environment.

## ✨ What This Skill Does

When installed, Claude becomes an expert n8n developer who can:

- ✅ Search for n8n nodes by name or functionality
- ✅ Retrieve exact node schemas and parameters
- ✅ Generate valid workflow JSON without hallucinating
- ✅ Follow n8n best practices and modern syntax
- ✅ Help debug and improve existing workflows

## 🔍 How It Works

The skill uses the \`n8nac\` CLI to access complete n8n node documentation:

\`\`\`bash
npx --yes n8nac skills search "http request"
npx --yes n8nac skills node-info "httpRequest"
npx --yes n8nac skills list
\`\`\`

Claude executes these commands automatically when you ask about n8n workflows.

## 🔒 Privacy & Security

This skill runs **100% locally**:
- No data sent to external servers
- NPX downloads the tool on first use
- All documentation accessed offline

## 📚 Documentation

Full documentation: https://etiennelescot.github.io/n8n-as-code/docs/usage/claude-skill/

## 🤝 Support

Issues or questions? Visit: https://github.com/EtienneLescot/n8n-as-code/issues

## 📄 License

MIT License - Part of the n8n-as-code project
`;

    fs.writeFileSync(path.join(SKILL_OUTPUT_DIR, 'README.md'), readme);
    log('   ✓ README.md generated', 'green');
}

function generateInstallScript() {
    log('\n🚀 Generating install scripts...', 'blue');

    // For Unix/Mac
    const installSh = `#!/bin/bash
# Quick installation script for n8n-architect Claude Skill

echo "🚀 Installing n8n Architect Claude Skill..."

# Check if Claude skills directory exists
CLAUDE_SKILLS_DIR="$HOME/.claude/skills"

if [ ! -d "$CLAUDE_SKILLS_DIR" ]; then
  echo "📁 Creating Claude skills directory..."
  mkdir -p "$CLAUDE_SKILLS_DIR"
fi

# Copy skill
echo "📋 Copying skill files..."
cp -r n8n-architect "$CLAUDE_SKILLS_DIR/"

echo "✅ Installation complete!"
echo ""
echo "The n8n-architect skill is now available to Claude Code."
echo "It will automatically load when you start Claude Code."
echo ""
echo "For Claude.ai, upload the n8n-architect folder as a ZIP in Settings → Features."
`;

    const installScriptPath = path.join(DIST_DIR, 'install.sh');
    fs.writeFileSync(installScriptPath, installSh);
    fs.chmodSync(installScriptPath, 0o755);

    log('   ✓ install.sh created', 'green');
}

function printSummary() {
    log('\n' + '='.repeat(60), 'cyan');
    log('✨ Skill Adapter Build Complete!', 'green');
    log('='.repeat(60), 'cyan');

    log('\n📦 Generated files:', 'blue');
    log(`   ${DIST_DIR}/`, 'yellow');
    log(`   ├── n8n-architect/`, 'yellow');
    log(`   │   ├── SKILL.md`, 'yellow');
    log(`   │   └── README.md`, 'yellow');
    log(`   └── install.sh`, 'yellow');
    log(`   ${CLAUDE_PLUGIN_SKILL_DIR}/SKILL.md`, 'yellow');
    log(`   ${OPENCLAW_PLUGIN_SKILL_DIR}/SKILL.md`, 'yellow');

    log('\n' + '='.repeat(60) + '\n', 'cyan');
}

// Main build process
(async () => {
    try {
        log('\n🏗️  Building skill adapters...', 'blue');
        log(`   Root: ${PACKAGE_ROOT}`, 'gray');

        cleanDist();
        createSkillStructure();
        await generateSkillMd();
        generateReadme();
        generateInstallScript();
        printSummary();

        process.exit(0);
    } catch (error) {
        log('\n❌ Skill adapter build failed:', 'red');
        console.error(error);
        process.exit(1);
    }
})();
