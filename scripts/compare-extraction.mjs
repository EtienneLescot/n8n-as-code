import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const INDEX_FILE = path.resolve(ROOT_DIR, 'packages/agent-cli/src/assets/n8n-nodes-index.json');

if (!fs.existsSync(INDEX_FILE)) {
  console.error(`❌ Error: Index file not found at ${INDEX_FILE}`);
  process.exit(1);
}

const extractedJson = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));

// Fonction pour compter les propriétés dans un fichier .node.ts
function countPropertiesInSource(content) {
  // Estimation simple basée sur l'occurrence de "displayName:"
  // (Une propriété a généralement un displayName)
  const matches = content.match(/displayName:/g);
  return matches ? matches.length : 0;
}

// Fonction pour compter récursivement les propriétés extraites (JSON)
function countExtractedProperties(obj) {
  if (!obj || typeof obj !== 'object') return 0;

  let count = 0;

  // Si c'est un tableau de propriétés (le format de n8n-nodes-index.json)
  if (Array.isArray(obj)) {
    count += obj.length;
    // On pourrait descendre récursivement, mais n8n sémantise surtout le 1er niveau
  } else if (obj.properties && Array.isArray(obj.properties)) {
    count += obj.properties.length;
  }

  return count;
}

async function generateReport() {
  console.log('📊 Generating Extraction Coverage Report...');

  const sourceFileCount = extractedJson.sourceFileCount || 0;
  const nodes = extractedJson.nodes || {};
  const nodeNames = Object.keys(nodes);
  const uniqueNodesCount = nodeNames.length;

  const report = [
    '# 📊 n8n Node Extraction Coverage Report',
    '',
    `Generated on: ${new Date().toLocaleString()}`,
    '',
    '## 📈 Global Statistics',
    '',
    '| Metric | Value |',
    '| :--- | :--- |',
    `| Source Files Processed | ${sourceFileCount} |`,
    `| Unique Nodes Found | ${uniqueNodesCount} |`,
    '',
    '## 🔍 Detailed Coverage',
    '',
    '| Node Name | Extracted Props | Status |',
    '| :--- | :--- | :--- |'
  ];

  let completeCount = 0;
  let partialCount = 0;
  let emptyCount = 0;

  for (const name of nodeNames.sort()) {
    const node = nodes[name];
    const extractedProps = countExtractedProperties(node);

    let status = '✅';
    if (extractedProps === 0) {
      status = '❌';
      emptyCount++;
    } else if (extractedProps < 5) { // Arbitrary small number for partial
      status = '⚠️';
      partialCount++;
    } else {
      completeCount++;
    }

    report.push(`| ${name} | ${extractedProps} | ${status} |`);
  }

  report.push('', '## 🏁 Summary', '');
  report.push(`- ✅ **Complete**: ${completeCount} nodes`);
  report.push(`- ⚠️ **Partial**: ${partialCount} nodes`);
  report.push(`- ❌ **Empty/Missing**: ${emptyCount} nodes`);

  const reportPath = path.resolve(ROOT_DIR, 'packages/agent-cli/extraction-report.md');
  fs.writeFileSync(reportPath, report.join('\n'));
  console.log(`📄 Report saved to: ${reportPath}`);
}

generateReport().catch(err => {
  console.error('❌ Error generating report:', err);
  process.exit(1);
});
