#!/usr/bin/env node

/**
 * Validation Script for Claude Agent Skill
 * 
 * Validates that SKILL.md meets Anthropic's requirements:
 * - Valid YAML frontmatter
 * - Required fields present
 * - Field constraints respected
 * - No forbidden content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_FILE = path.join(__dirname, 'templates/SKILL.md');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Validation Rules
const RULES = {
  NAME_MAX_LENGTH: 64,
  DESCRIPTION_MAX_LENGTH: 1024,
  FORBIDDEN_WORDS: ['anthropic', 'claude'], // In name field
  FORBIDDEN_XML_TAGS: ['<xml', '<script', '<style'],
};

class SkillValidator {
  constructor(filePath) {
    this.filePath = filePath;
    this.errors = [];
    this.warnings = [];
    this.content = '';
    this.frontmatter = null;
    this.body = '';
  }

  validate() {
    log('\n🔍 Validating Claude Agent Skill...', 'blue');
    log(`📄 File: ${this.filePath}\n`, 'gray');

    if (!this.loadFile()) return false;
    if (!this.parseFrontmatter()) return false;
    
    this.validateName();
    this.validateDescription();
    this.checkForbiddenContent();
    this.checkBashCommands();
    this.checkStructure();

    return this.reportResults();
  }

  loadFile() {
    try {
      this.content = fs.readFileSync(this.filePath, 'utf8');
      success('File loaded successfully');
      return true;
    } catch (err) {
      error(`Failed to read file: ${err.message}`);
      return false;
    }
  }

  parseFrontmatter() {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = this.content.match(frontmatterRegex);

    if (!match) {
      error('No YAML frontmatter found. File must start with --- and end with ---');
      return false;
    }

    const [, yamlContent, bodyContent] = match;
    this.body = bodyContent;

    // Parse YAML manually (simple parser for our needs)
    try {
      this.frontmatter = this.parseYAML(yamlContent);
      success('YAML frontmatter parsed successfully');
      return true;
    } catch (err) {
      error(`Failed to parse YAML: ${err.message}`);
      return false;
    }
  }

  parseYAML(yamlString) {
    const result = {};
    let currentKey = null;
    let multilineValue = [];

    const lines = yamlString.split('\n');
    
    for (const line of lines) {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) continue;

      // Check for key-value pair
      const kvMatch = line.match(/^(\w+):\s*(.*)$/);
      
      if (kvMatch) {
        // Save previous multiline value if exists
        if (currentKey && multilineValue.length > 0) {
          result[currentKey] = multilineValue.join(' ').trim();
          multilineValue = [];
        }

        const [, key, value] = kvMatch;
        currentKey = key;

        if (value) {
          result[key] = value.trim();
          currentKey = null;
        }
      } else if (currentKey) {
        // Continuation of multiline value
        multilineValue.push(line.trim());
      }
    }

    // Save last multiline value
    if (currentKey && multilineValue.length > 0) {
      result[currentKey] = multilineValue.join(' ').trim();
    }

    return result;
  }

  validateName() {
    info('Checking name field...');

    if (!this.frontmatter.name) {
      this.errors.push('Missing required field: name');
      return;
    }

    const { name } = this.frontmatter;

    // Check length
    if (name.length > RULES.NAME_MAX_LENGTH) {
      this.errors.push(`Name too long: ${name.length} chars (max ${RULES.NAME_MAX_LENGTH})`);
    }

    // Check format (lowercase, hyphens only)
    if (!/^[a-z0-9-]+$/.test(name)) {
      this.errors.push('Name must contain only lowercase letters, numbers, and hyphens');
    }

    // Check forbidden words
    const nameLower = name.toLowerCase();
    for (const word of RULES.FORBIDDEN_WORDS) {
      if (nameLower.includes(word)) {
        this.errors.push(`Name contains forbidden word: "${word}"`);
      }
    }

    if (this.errors.length === 0) {
      success(`  Name: "${name}" (${name.length} chars)`);
    }
  }

  validateDescription() {
    info('Checking description field...');

    if (!this.frontmatter.description) {
      this.errors.push('Missing required field: description');
      return;
    }

    const { description } = this.frontmatter;

    // Check if empty
    if (!description.trim()) {
      this.errors.push('Description cannot be empty');
      return;
    }

    // Check length
    if (description.length > RULES.DESCRIPTION_MAX_LENGTH) {
      this.errors.push(`Description too long: ${description.length} chars (max ${RULES.DESCRIPTION_MAX_LENGTH})`);
    }

    // Check if it explains WHEN to use the skill
    const hasWhen = /when|if|for|use this|should/i.test(description);
    if (!hasWhen) {
      this.warnings.push('Description should include when to use this skill');
    }

    success(`  Description: ${description.substring(0, 80)}... (${description.length} chars)`);
  }

  checkForbiddenContent() {
    info('Checking for forbidden content...');

    // Check for XML tags
    for (const tag of RULES.FORBIDDEN_XML_TAGS) {
      if (this.content.toLowerCase().includes(tag)) {
        this.errors.push(`Forbidden XML tag found: ${tag}`);
      }
    }

    success('  No forbidden content detected');
  }

  checkBashCommands() {
    info('Checking bash commands...');

    // Find all bash code blocks
    const bashBlocks = this.body.match(/```bash\n([\s\S]*?)```/g) || [];

    if (bashBlocks.length === 0) {
      this.warnings.push('No bash commands found. Skill may not execute any tools.');
    }

    // Check for npx -y usage
    let hasNpxCommands = false;
    for (const block of bashBlocks) {
      if (block.includes('npx')) {
        hasNpxCommands = true;
        if (!block.includes('npx -y')) {
          this.warnings.push('Found npx command without -y flag. This may cause interactive prompts.');
        }
      }
    }

    if (hasNpxCommands) {
      success(`  Found ${bashBlocks.length} bash command block(s)`);
    }
  }

  checkStructure() {
    info('Checking document structure...');

    const hasHeadings = /^#{1,6}\s+/m.test(this.body);
    const hasInstructions = /instructions?:/i.test(this.body);
    const hasExamples = /examples?:/i.test(this.body);

    if (!hasHeadings) {
      this.warnings.push('No markdown headings found. Consider adding structure.');
    }

    if (!hasInstructions) {
      this.warnings.push('No "Instructions" section found. Consider adding clear instructions.');
    }

    if (!hasExamples) {
      this.warnings.push('No "Examples" section found. Consider adding usage examples.');
    }

    success('  Document structure looks good');
  }

  reportResults() {
    log('\n' + '='.repeat(60), 'cyan');
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      log('✨ Validation Passed! Skill is ready to use.', 'green');
      log('='.repeat(60) + '\n', 'cyan');
      return true;
    }

    if (this.errors.length > 0) {
      log(`\n❌ ${this.errors.length} Error(s):`, 'red');
      this.errors.forEach((err, i) => {
        log(`   ${i + 1}. ${err}`, 'red');
      });
    }

    if (this.warnings.length > 0) {
      log(`\n⚠️  ${this.warnings.length} Warning(s):`, 'yellow');
      this.warnings.forEach((warn, i) => {
        log(`   ${i + 1}. ${warn}`, 'yellow');
      });
    }

    log('\n' + '='.repeat(60), 'cyan');

    if (this.errors.length > 0) {
      log('\n❌ Validation Failed. Please fix the errors above.\n', 'red');
      return false;
    } else {
      log('\n✅ Validation Passed with warnings. Consider addressing them.\n', 'yellow');
      return true;
    }
  }
}

// Run validation
try {
  const validator = new SkillValidator(SKILL_FILE);
  const isValid = validator.validate();
  process.exit(isValid ? 0 : 1);
} catch (err) {
  error(`Validation crashed: ${err.message}`);
  console.error(err);
  process.exit(1);
}
