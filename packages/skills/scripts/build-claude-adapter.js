#!/usr/bin/env node

/**
 * Build Script for Claude Adapter (@n8n-as-code/skills)
 * 
 * Generates a distributable Claude Agent Skill package:
 * - Copies SKILL.md with proper structure
 * - Creates a ZIP file for easy distribution
 * - Generates installation instructions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root of the skills package
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist', 'adapters', 'claude');
const SKILL_OUTPUT_DIR = path.join(DIST_DIR, 'n8n-architect');
const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'src', 'adapters', 'claude', 'templates');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
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

    // Create scripts subdirectory
    const scriptsDir = path.join(SKILL_OUTPUT_DIR, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    log('   ✓ Structure created', 'green');
}

function copySkillFiles() {
    log('\n📄 Copying SKILL.md...', 'blue');

    const sourcePath = path.join(TEMPLATES_DIR, 'SKILL.md');
    const destPath = path.join(SKILL_OUTPUT_DIR, 'SKILL.md');

    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        log('   ✓ SKILL.md copied', 'green');
    } else {
        log(`   ❌ Source SKILL.md not found at ${sourcePath}`, 'red');
        throw new Error('SKILL.md template missing');
    }
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

## ✨ What This Skill Does

When installed, Claude becomes an expert n8n developer who can:

- ✅ Search for n8n nodes by name or functionality
- ✅ Retrieve exact node schemas and parameters
- ✅ Generate valid workflow JSON without hallucinating
- ✅ Follow n8n best practices and modern syntax
- ✅ Help debug and improve existing workflows

## 🔍 How It Works

The skill uses the \`@n8n-as-code/skills\` package (formerly skills) to access complete n8n node documentation:

\`\`\`bash
npx -y @n8n-as-code/skills search "http request"
npx -y @n8n-as-code/skills get "httpRequest"
npx -y @n8n-as-code/skills list
\`\`\`

Claude executes these commands automatically when you ask about n8n workflows.

## 🔒 Privacy & Security

This skill runs **100% locally**:
- No data sent to external servers
- NPX downloads the tool on first use
- All documentation accessed offline

## 📚 Documentation

Full documentation: https://github.com/EtienneLescot/n8n-as-code

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
    log('✨ Claude Adapter Build Complete!', 'green');
    log('='.repeat(60), 'cyan');

    log('\n📦 Generated files:', 'blue');
    log(`   ${DIST_DIR}/`, 'yellow');
    log(`   ├── n8n-architect/`, 'yellow');
    log(`   │   ├── SKILL.md`, 'yellow');
    log(`   │   └── README.md`, 'yellow');
    log(`   └── install.sh`, 'yellow');

    log('\n' + '='.repeat(60) + '\n', 'cyan');
}

// Main build process
try {
    log('\n🏗️  Building Claude Adapter...', 'blue');
    log(`   Root: ${PACKAGE_ROOT}`, 'gray');

    cleanDist();
    createSkillStructure();
    copySkillFiles();
    generateReadme();
    generateInstallScript();
    printSummary();

    process.exit(0);
} catch (error) {
    log('\n❌ Build failed:', 'red');
    console.error(error);
    process.exit(1);
}
