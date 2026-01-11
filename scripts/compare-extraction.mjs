import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extractedJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../packages/core/src/assets/n8n-nodes-index.json'), 'utf-8'));

// Fonction pour compter les propriétés dans un fichier .node.ts
function countPropertiesInSource(content) {
  try {
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const propertyPattern = /{(?=[^}]*name:)(?=[^}]*type:)/g;
    const matches = cleanContent.match(propertyPattern);
    return matches ? matches.length : 0;
  } catch (error) {
    return 0;
  }
}

// Trouver tous les fichiers .node.ts (y compris Triggers)
function findAllNodeFiles(dir) {
  const results = [];
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        results.push(...findAllNodeFiles(fullPath));
      } else if (file.name.endsWith('.node.ts')) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return results;
}

// 1. Get metadata from JSON
const nodesMap = extractedJson.nodes || extractedJson;
const extractedNodes = Object.keys(nodesMap);
const sourceFileCount = extractedJson.sourceFileCount || 0; // The 525 number

// 2. Validate against local disk scan (optional, but good for sanity check)
// (We keep the existing source scanning logic to compare property counts)
const sourcePath = path.join(__dirname, '../.n8n-cache/packages/nodes-base/nodes');
const allNodeFiles = findAllNodeFiles(sourcePath);
// Note: allNodeFiles.length should match sourceFileCount roughly

const nodeFilesMap = new Map();
for (const filePath of allNodeFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
  if (nameMatch) {
    const nodeName = nameMatch[1];
    const sourceProps = countPropertiesInSource(content);
    // Keep max props if duplicates found (version collapsing)
    if (nodeFilesMap.has(nodeName)) {
      const existing = nodeFilesMap.get(nodeName);
      if (sourceProps > existing.sourceProps) {
        nodeFilesMap.set(nodeName, { name: nodeName, sourceProps: sourceProps });
      }
    } else {
      nodeFilesMap.set(nodeName, { name: nodeName, sourceProps: sourceProps });
    }
  }
}

// 3. Build Analysis
const uniqueNodesCount = extractedNodes.length; // The 434 number
const analysis = [];

// Helper to recursively count properties in extracted JSON object
function countExtractedProperties(nodeData) {
  if (!nodeData || !nodeData.properties) return 0;

  let count = 0;

  function walk(props) {
    if (!Array.isArray(props)) return;
    for (const prop of props) {
      count++; // Count this property

      // Recurse into options if multiple options (Fixed Collection / Options)
      if (prop.options && Array.isArray(prop.options)) {
        // Check if options contain nested properties (Fixed Collection style)
        // Usually options have 'name', 'value' (not props) OR 'name', 'values' (nested)
        // But in n8n schema, FixedCollection options look like: { name: 'Foo', values: [ {displayName: 'Bar'...} ] }
        // OR standard options: { name: 'Foo', value: 'foo' } -> Not properties.

        for (const opt of prop.options) {
          if (opt.values && Array.isArray(opt.values)) {
            walk(opt.values);
          }
        }
      }

      // Recurse into collection properties (Simpler collection)
      if (prop.type === 'collection' && prop.options && Array.isArray(prop.options)) {
        // In type: 'collection', options array directly contains the sub-properties
        walk(prop.options);
      }
    }
  }

  walk(nodeData.properties);
  return count;
}

for (const name of extractedNodes) {
  const extracted = nodesMap[name];
  const extractedProps = countExtractedProperties(extracted);

  // Try to find estimated source properties
  const sourceEst = nodeFilesMap.get(name)?.sourceProps || 0;

  // Update the stats logic:
  // If we have MORE extracted than source (possible due to mixins/defaults), cap it or accept it.
  // ...

  // Determine status
  let status = '✅';
  if (extractedProps === 0) status = '❌';
  else if (extractedProps < sourceEst * 0.8) status = '⚠️'; // Heuristic

  analysis.push({
    name,
    extractedProps,
    sourceEst,
    status
  });
}

// 4. Stats
const stats = {
  totalFiles: sourceFileCount > 0 ? sourceFileCount : allNodeFiles.length,
  uniqueNodes: uniqueNodesCount,
  complete: analysis.filter(n => n.status === '✅').length,
  partial: analysis.filter(n => n.status === '⚠️').length,
  empty: analysis.filter(n => n.status === '❌').length
};

// 5. Generate Markdown Report
const reportContent = [];
const log = (line) => {
  console.log(line);
  reportContent.push(line);
};

log(`# n8n Node Extraction Coverage Report`);
log(`Generated on: ${new Date().toLocaleString()}`);

log(`\n## Summary`);
log(`- **Total Source Files Detected**: ${stats.totalFiles}`);
log(`- **Unique Nodes Extracted**: ${stats.uniqueNodes}`);
log(`\n### Coverage Breakdown (of ${stats.uniqueNodes} unique nodes)`);
log(`- **Complete (✅)**: ${stats.complete} (${Math.round(stats.complete / stats.uniqueNodes * 100)}%)`);
log(`- **Partial (⚠️)**: ${stats.partial} (${Math.round(stats.partial / stats.uniqueNodes * 100)}%)`);
log(`- **Empty/Missing (❌)**: ${stats.empty} (${Math.round(stats.empty / stats.uniqueNodes * 100)}%)`);

if (stats.partial > 0 || stats.empty > 0) {
  log(`\n## ⚠️ Attention Required: Nodes with Missing Properties`);
  log(`| Node | Extracted | Est. Source | Status |`);
  log(`|---|---|---|---|`);

  // Sort logic: Empty first, then Partial, then by name
  const problemNodes = analysis.filter(n => n.status !== '✅');
  problemNodes.sort((a, b) => {
    if (a.status !== b.status) return a.status === '❌' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  problemNodes.forEach(node => {
    log(`| ${node.name} | ${node.extractedProps} | ${node.sourceEst} | ${node.status} |`);
  });
}

log(`\n## Full Node List (Reference)`);
log(`| Node | Extracted Properties | Status |`);
log(`|---|---|---|`);
analysis.sort((a, b) => a.name.localeCompare(b.name));
analysis.forEach(node => {
  log(`| ${node.name} | ${node.extractedProps} | ${node.status} |`);
});

// Write report to file
const reportPath = path.resolve(__dirname, '../packages/core/extraction-report.md');
fs.writeFileSync(reportPath, reportContent.join('\n'));
console.log(`\n📄 Report saved to: ${reportPath}`);

process.exit(0);
