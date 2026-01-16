#!/usr/bin/env node

/**
 * Build Script for @n8n-as-code/claude-skill
 * 
 * Generates a distributable Claude Agent Skill package:
 * - Copies SKILL.md with proper structure
 * - Includes helper scripts
 * - Creates a ZIP file for easy distribution
 * - Generates installation instructions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, 'dist');
const SKILL_DIR = path.join(DIST_DIR, 'n8n-architect');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
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
  fs.mkdirSync(SKILL_DIR, { recursive: true });
  
  // Create scripts subdirectory
  const scriptsDir = path.join(SKILL_DIR, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  
  log('   ✓ Structure created', 'green');
}

function copySkillFiles() {
  log('\n📄 Copying SKILL.md...', 'blue');
  
  const sourcePath = path.join(TEMPLATES_DIR, 'SKILL.md');
  const destPath = path.join(SKILL_DIR, 'SKILL.md');
  
  fs.copyFileSync(sourcePath, destPath);
  log('   ✓ SKILL.md copied', 'green');
}

function copyScripts() {
  log('\n🔧 Copying helper scripts...', 'blue');
  
  const scriptsSourceDir = path.join(TEMPLATES_DIR, 'scripts');
  const scriptsDestDir = path.join(SKILL_DIR, 'scripts');
  
  const scripts = fs.readdirSync(scriptsSourceDir);
  
  scripts.forEach(script => {
    const sourcePath = path.join(scriptsSourceDir, script);
    const destPath = path.join(scriptsDestDir, script);
    
    fs.copyFileSync(sourcePath, destPath);
    
    // Make scripts executable
    fs.chmodSync(destPath, 0o755);
    
    log(`   ✓ ${script}`, 'green');
  });
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

### For Claude API

Reference the skill in your API calls:

\`\`\`typescript
const response = await client.messages.create({
  model: 'claude-3-7-sonnet-20250219',
  betas: ['code-execution-2025-08-25', 'skills-2025-10-02', 'files-api-2025-04-14'],
  container: {
    type: 'code_execution_2025_01',
    skills: ['n8n-architect']
  },
  messages: [{ role: 'user', content: 'Create an n8n workflow...' }]
});
\`\`\`

## ✨ What This Skill Does

When installed, Claude becomes an expert n8n developer who can:

- ✅ Search for n8n nodes by name or functionality
- ✅ Retrieve exact node schemas and parameters
- ✅ Generate valid workflow JSON without hallucinating
- ✅ Follow n8n best practices and modern syntax
- ✅ Help debug and improve existing workflows

## 🔍 How It Works

The skill uses the \`@n8n-as-code/agent-cli\` package to access complete n8n node documentation:

\`\`\`bash
npx -y @n8n-as-code/agent-cli search "http request"
npx -y @n8n-as-code/agent-cli get "httpRequest"
npx -y @n8n-as-code/agent-cli list
\`\`\`

Claude executes these commands automatically when you ask about n8n workflows.

## 📖 Example Usage

**You:** "Create a workflow that calls the GitHub API and sends results to Slack"

**Claude will:**
1. Search for "http request" and "slack" nodes
2. Retrieve their exact schemas
3. Generate valid workflow JSON with proper parameters
4. Explain the configuration and required credentials

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

  fs.writeFileSync(path.join(SKILL_DIR, 'README.md'), readme);
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

  fs.writeFileSync(path.join(DIST_DIR, 'install.sh'), installSh);
  fs.chmodSync(path.join(DIST_DIR, 'install.sh'), 0o755);
  
  log('   ✓ install.sh created', 'green');
}

function printSummary() {
  log('\n' + '='.repeat(60), 'cyan');
  log('✨ Build Complete!', 'green');
  log('='.repeat(60), 'cyan');
  
  log('\n📦 Generated files:', 'blue');
  log(`   ${DIST_DIR}/`, 'yellow');
  log(`   ├── n8n-architect/`, 'yellow');
  log(`   │   ├── SKILL.md`, 'yellow');
  log(`   │   ├── README.md`, 'yellow');
  log(`   │   └── scripts/`, 'yellow');
  log(`   │       ├── n8n-search.sh`, 'yellow');
  log(`   │       ├── n8n-get.sh`, 'yellow');
  log(`   │       └── n8n-list.sh`, 'yellow');
  log(`   └── install.sh`, 'yellow');
  
  log('\n📚 Next steps:', 'blue');
  log('   1. Test locally:', 'cyan');
  log('      cd dist && ./install.sh', 'yellow');
  log('');
  log('   2. Create ZIP for distribution:', 'cyan');
  log('      cd dist && zip -r n8n-architect-skill.zip n8n-architect/', 'yellow');
  log('');
  log('   3. Upload to GitHub Releases', 'cyan');
  log('      Attach n8n-architect-skill.zip to your next release', 'yellow');
  
  log('\n' + '='.repeat(60) + '\n', 'cyan');
}

// Main build process
try {
  log('\n🏗️  Building @n8n-as-code/claude-skill...', 'blue');
  
  cleanDist();
  createSkillStructure();
  copySkillFiles();
  copyScripts();
  generateReadme();
  generateInstallScript();
  printSummary();
  
  process.exit(0);
} catch (error) {
  log('\n❌ Build failed:', 'red');
  console.error(error);
  process.exit(1);
}
