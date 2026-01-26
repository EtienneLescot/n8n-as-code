#!/usr/bin/env node
import chalk from 'chalk';

console.warn(chalk.yellow('⚠️  Warning: "n8n-as-code" is deprecated and will be removed in a future version.'));
console.warn(chalk.yellow('   Please use the new "n8nac" command instead.\n'));

// Import the main CLI
import '../index.js';
