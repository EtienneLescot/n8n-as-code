#!/usr/bin/env node

/**
 * Local CI Test Script
 * 
 * This script simulates the GitHub Actions CI workflow steps locally.
 * Use it to test changes before committing.
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🚀 Testing CI workflow steps locally...');
console.log(`📁 Working directory: ${rootDir}`);
console.log('='.repeat(60));

const steps = [
  {
    name: 'Check Node.js version',
    command: 'node --version',
    optional: false
  },
  {
    name: 'Check npm version',
    command: 'npm --version',
    optional: false
  },
  {
    name: 'Install dependencies',
    command: 'npm install',
    optional: false
  },
  {
    name: 'Check pnpm installation',
    command: 'pnpm --version || echo "pnpm not installed, installing..."',
    optional: true
  },
  {
    name: 'Ensure n8n cache',
    command: 'node scripts/ensure-n8n-cache.cjs',
    optional: false
  },
  {
    name: 'Build packages',
    command: 'npm run build',
    optional: false
  },
  {
    name: 'Run tests',
    command: 'npm test',
    optional: false
  }
];

let allPassed = true;

for (const [index, step] of steps.entries()) {
  console.log(`\n${index + 1}/${steps.length} ${step.name}`);
  console.log(`$ ${step.command}`);
  
  try {
    const output = execSync(step.command, { 
      cwd: rootDir,
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    
    console.log(`✅ ${step.name} completed successfully`);
    if (output.trim()) {
      console.log(output.trim().split('\n').slice(0, 3).join('\n'));
      if (output.trim().split('\n').length > 3) {
        console.log('... (output truncated)');
      }
    }
  } catch (error) {
    if (step.optional) {
      console.log(`⚠️  ${step.name} failed (optional): ${error.message}`);
    } else {
      console.log(`❌ ${step.name} failed: ${error.message}`);
      allPassed = false;
      
      // Show error output
      if (error.stdout) {
        console.log('Stdout:', error.stdout.toString().slice(0, 500));
      }
      if (error.stderr) {
        console.log('Stderr:', error.stderr.toString().slice(0, 500));
      }
      
      console.log('\n💡 Tip: Check the troubleshooting section in Local CI_CD Testing Setup.md');
      break;
    }
  }
}

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('🎉 All CI steps passed locally! You can safely commit your changes.');
  process.exit(0);
} else {
  console.log('❌ Some CI steps failed. Please fix the issues before committing.');
  console.log('\nNext steps:');
  console.log('1. Review the error messages above');
  console.log('2. Check Local CI_CD Testing Setup.md for troubleshooting tips');
  console.log('3. Fix the issues and run this script again');
  process.exit(1);
}