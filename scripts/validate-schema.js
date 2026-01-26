#!/usr/bin/env node

/**
 * Schema Validation Script
 * 
 * Validates the extracted n8n node schema for:
 * - File size (< 5MB target)
 * - JSON structure validity
 * - Required fields presence
 * - AI usability checks
 * - Pruning validation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default schema path
const DEFAULT_SCHEMA_PATH = path.join(__dirname, '../packages/sync/src/assets/n8n-nodes-index.json');

// Parse command line arguments
const args = process.argv.slice(2);
const schemaPath = args.includes('--schema') 
  ? args[args.indexOf('--schema') + 1]
  : DEFAULT_SCHEMA_PATH;

const verbose = args.includes('--verbose');

console.log('🔍 n8n Schema Validator');
console.log(`Schema: ${schemaPath}`);

if (!fs.existsSync(schemaPath)) {
  console.error('❌ Error: Schema file not found');
  process.exit(1);
}

console.log('📊 Validating schema...');

// Load and parse schema
let schema;
try {
  const schemaData = fs.readFileSync(schemaPath, 'utf-8');
  schema = JSON.parse(schemaData);
} catch (err) {
  console.error('❌ Error: Invalid JSON in schema file');
  console.error(err.message);
  process.exit(1);
}

// Get file size
const fileSize = fs.statSync(schemaPath).size;
const sizeMB = fileSize / (1024 * 1024);

console.log(`\n📊 Basic Statistics:`);
console.log(`   File size: ${sizeMB.toFixed(2)}MB`);
console.log(`   Node count: ${schema.metadata?.nodeCount || 0}`);
console.log(`   n8n version: ${schema.metadata?.n8nVersion || 'unknown'}`);
console.log(`   Extracted at: ${schema.metadata?.extractedAt || 'unknown'}`);

// Validation results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function addResult(test, passed, message = '') {
  if (passed) {
    results.passed++;
    console.log(`   ✅ ${test}`);
    if (verbose && message) console.log(`      ${message}`);
  } else {
    results.failed++;
    console.log(`   ❌ ${test}`);
    if (message) console.log(`      ${message}`);
  }
}

function addWarning(test, message) {
  results.warnings++;
  console.log(`   ⚠️  ${test}`);
  if (message) console.log(`      ${message}`);
}

console.log('\n🔍 Running validations...');

// 1. File size validation
addResult(
  'File size < 5MB',
  sizeMB < 5,
  `Current size: ${sizeMB.toFixed(2)}MB`
);

addResult(
  'File size < 3MB (target)',
  sizeMB < 3,
  `Current size: ${sizeMB.toFixed(2)}MB`
);

// 2. Schema structure validation
addResult(
  'Has metadata section',
  schema.metadata && typeof schema.metadata === 'object',
  'Schema must have metadata section'
);

addResult(
  'Has nodes section',
  schema.nodes && typeof schema.nodes === 'object',
  'Schema must have nodes section'
);

addResult(
  'Has node count in metadata',
  schema.metadata?.nodeCount && schema.metadata.nodeCount > 0,
  `Node count: ${schema.metadata?.nodeCount || 0}`
);

addResult(
  'Has n8n version in metadata',
  schema.metadata?.n8nVersion && schema.metadata.n8nVersion !== 'unknown',
  `Version: ${schema.metadata?.n8nVersion || 'unknown'}`
);

// 3. Node count validation
const nodeCount = Object.keys(schema.nodes || {}).length;
addResult(
  'Node count matches metadata',
  nodeCount === (schema.metadata?.nodeCount || 0),
  `Actual: ${nodeCount}, Metadata: ${schema.metadata?.nodeCount || 0}`
);

addResult(
  'Has sufficient nodes (> 100)',
  nodeCount > 100,
  `Node count: ${nodeCount}`
);

// 4. Sample node validation
if (nodeCount > 0) {
  const sampleNode = Object.values(schema.nodes)[0];
  
  addResult(
    'Sample node has name field',
    sampleNode.name && typeof sampleNode.name === 'string',
    `Sample node name: ${sampleNode.name}`
  );
  
  addResult(
    'Sample node has displayName field',
    sampleNode.displayName && typeof sampleNode.displayName === 'string',
    `Sample node displayName: ${sampleNode.displayName}`
  );
  
  addResult(
    'Sample node has properties array',
    Array.isArray(sampleNode.properties),
    `Properties count: ${sampleNode.properties?.length || 0}`
  );
  
  // 5. Pruning validation
  addResult(
    'Sample node has no icon field (pruned)',
    !('icon' in sampleNode),
    'Heavy metadata should be removed'
  );
  
  addResult(
    'Sample node has no color field (pruned)',
    !('color' in sampleNode),
    'Color information should be removed'
  );
  
  // 6. AI optimization validation
  addResult(
    'Sample node has _aiHint',
    sampleNode._aiHint && typeof sampleNode._aiHint === 'string',
    'AI guidance should be present'
  );
  
  // 7. Property validation
  if (sampleNode.properties && sampleNode.properties.length > 0) {
    const sampleProperty = sampleNode.properties[0];
    
    addResult(
      'Sample property has name field',
      sampleProperty.name && typeof sampleProperty.name === 'string',
      'Property must have name for JSON keys'
    );
    
    addResult(
      'Sample property has displayName field',
      sampleProperty.displayName && typeof sampleProperty.displayName === 'string',
      'Property must have displayName for UI'
    );
    
    addResult(
      'Sample property has type field',
      sampleProperty.type && typeof sampleProperty.type === 'string',
      'Property must have type information'
    );
    
    // Check for dynamic properties
    if (sampleProperty._isDynamic) {
      addResult(
        'Dynamic property is properly marked',
        sampleProperty._isDynamic === true,
        'Dynamic properties should be marked for special handling'
      );
    }
  }
}

// 8. Metadata validation
if (schema.metadata) {
  addResult(
    'Metadata has schemaVersion',
    schema.metadata.schemaVersion && typeof schema.metadata.schemaVersion === 'string',
    `Schema version: ${schema.metadata.schemaVersion}`
  );
  
  addResult(
    'Metadata has optimized flag',
    schema.metadata.optimized === true,
    'Should be marked as optimized'
  );
}

// 9. Error handling validation
if (schema.metadata?.errorCount > 0) {
  addWarning(
    'Errors during extraction',
    `${schema.metadata.errorCount} nodes had errors during extraction`
  );
}

// 10. AI-specific validations
console.log('\n🤖 AI-specific validations...');

// Check for AI guidance
const hasAiHints = Object.values(schema.nodes || {}).some(node => 
  node._aiHint && typeof node._aiHint === 'string'
);

addResult(
  'Has AI guidance hints',
  hasAiHints,
  'AI guidance helps prevent hallucinations'
);

// Check for name vs displayName guidance
const hasNameGuidance = Object.values(schema.nodes || {}).some(node =>
  node.properties?.some(prop => 
    prop.description && prop.description.includes('JSON key')
  )
);

addResult(
  'Has name vs displayName guidance',
  hasNameGuidance,
  'AI should know to use "name" field for JSON keys'
);

// Summary
console.log('\n📊 Validation Summary:');
console.log(`   ✅ Passed: ${results.passed}`);
console.log(`   ❌ Failed: ${results.failed}`);
console.log(`   ⚠️  Warnings: ${results.warnings}`);

// Final result
if (results.failed === 0) {
  console.log('\n🎉 All validations passed! Schema is ready for production.');
  process.exit(0);
} else {
  console.log(`\n❌ ${results.failed} validation(s) failed. Please fix the issues above.`);
  process.exit(1);
}