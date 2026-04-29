#!/usr/bin/env node

/**
 * Builds portable agent skill artifacts from the canonical @n8n-as-code/skills
 * source and mirrors them into facade plugin trees.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist', 'adapters', 'agent-skills');
const SKILL_NAMES = ['n8n-manager', 'n8n-architect'];
const PLUGIN_SKILL_ROOTS = [
  path.join(WORKSPACE_ROOT, 'plugins', 'claude', 'n8n-as-code', 'skills'),
  path.join(WORKSPACE_ROOT, 'plugins', 'openclaw', 'n8n-as-code', 'skills'),
  path.join(WORKSPACE_ROOT, 'plugins', 'cursor', 'n8n-as-code', 'skills'),
];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function getAiContextGenerator() {
  const distPath = path.resolve(__dirname, '..', 'dist', 'services', 'ai-context-generator.js');
  if (!fs.existsSync(distPath)) {
    throw new Error('AiContextGenerator not found in dist/. Please run "npm run build --workspace=packages/skills" first.');
  }
  const mod = await import(distPath);
  return new mod.AiContextGenerator();
}

function writeSkill(root, skillName, content) {
  const skillDir = path.join(root, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}

function cleanDist() {
  log('\nCleaning generated skill adapter dist...', 'blue');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

function generateReadme() {
  const readme = `# n8n-as-code Agent Skills

Portable n8n-as-code skills for agents that can read \`SKILL.md\` files.

## Skills

- \`n8n-manager\`: instance, runtime, tunnel, auth, project, credential, and workflow presentation management.
- \`n8n-architect\`: workflow authoring, sync, node schemas, validation, push/pull, and context-root workflow operations.

Install both skills in your agent runtime, or use the copies generated in a context root by \`n8nac update-ai\`:

\`\`\`
.agents/skills/n8n-manager/SKILL.md
.agents/skills/n8n-architect/SKILL.md
\`\`\`
`;
  fs.writeFileSync(path.join(DIST_DIR, 'README.md'), readme);
}

async function generateSkills() {
  const generator = await getAiContextGenerator();

  for (const skillName of SKILL_NAMES) {
    const content = generator.getAgentSkillContent(skillName);
    writeSkill(DIST_DIR, skillName, content);
    for (const pluginSkillRoot of PLUGIN_SKILL_ROOTS) {
      writeSkill(pluginSkillRoot, skillName, content);
    }
  }
}

function printSummary() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Agent skill adapter build complete.', 'green');
  log('='.repeat(60), 'cyan');
  log(`\nGenerated dist: ${DIST_DIR}`, 'yellow');
  for (const pluginRoot of PLUGIN_SKILL_ROOTS) {
    log(`Mirrored plugin skills: ${pluginRoot}`, 'yellow');
  }
}

(async () => {
  try {
    log('\nBuilding portable agent skill adapters...', 'blue');
    log(`Root: ${PACKAGE_ROOT}`, 'gray');
    cleanDist();
    await generateSkills();
    generateReadme();
    printSummary();
  } catch (error) {
    log('\nSkill adapter build failed:', 'red');
    console.error(error);
    process.exit(1);
  }
})();
