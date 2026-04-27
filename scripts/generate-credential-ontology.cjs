const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.resolve(ROOT_DIR, 'packages/skills/src/assets/n8n-credentials-ontology.json');
const NODES_INDEX_FILE = path.resolve(ROOT_DIR, 'packages/skills/src/assets/n8n-nodes-index.json');
const CACHE_METADATA_PATH = path.resolve(ROOT_DIR, '.n8n-cache', '.cache-metadata.json');

const SCAN_DIRS = [
  path.resolve(ROOT_DIR, '.n8n-cache/packages/nodes-base/dist/credentials'),
  path.resolve(ROOT_DIR, '.n8n-cache/packages/@n8n/nodes-langchain/dist/credentials'),
];

[
  path.resolve(ROOT_DIR, '.n8n-cache/node_modules'),
  path.resolve(ROOT_DIR, '.n8n-cache/packages/nodes-base/node_modules'),
  path.resolve(ROOT_DIR, '.n8n-cache/packages/@n8n/nodes-langchain/node_modules'),
].forEach((modulePath) => {
  if (fs.existsSync(modulePath) && !module.paths.includes(modulePath)) {
    module.paths.push(modulePath);
  }
});

function findCredentialFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results.push(...findCredentialFiles(filePath));
    } else if (entry.endsWith('.credentials.js')) {
      results.push(filePath);
    }
  }
  return results;
}

async function loadModule(filePath) {
  try {
    return require(filePath);
  } catch (error) {
    if (error.code === 'ERR_REQUIRE_ESM' || error.code === 'ERR_REQUIRE_ASYNC_MODULE') {
      const ns = await import(pathToFileURL(filePath).href);
      return ns.default && typeof ns.default === 'object' ? { ...ns, ...ns.default } : ns;
    }
    throw error;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function extractCredential(module) {
  for (const item of Object.values(module)) {
    if (typeof item !== 'function' || !item.prototype) continue;
    try {
      const instance = new item();
      if (instance?.name && instance?.displayName) {
        return {
          typeName: instance.name,
          displayName: instance.displayName,
          documentationUrl: instance.documentationUrl,
          properties: clone(instance.properties || []),
          source: 'n8n-cache',
        };
      }
    } catch (error) {
      if (process.env.DEBUG) console.warn(`Failed to instantiate credential: ${error.message}`);
    }
  }
  return null;
}

function readNodeUsages() {
  if (!fs.existsSync(NODES_INDEX_FILE)) return new Map();
  const nodeIndex = JSON.parse(fs.readFileSync(NODES_INDEX_FILE, 'utf8'));
  const usages = new Map();

  for (const node of nodeIndex.nodes || []) {
    for (const credential of node.credentials || []) {
      if (!credential?.name) continue;
      const list = usages.get(credential.name) || [];
      list.push({
        nodeName: node.name,
        nodeType: node.fullType,
        nodeDisplayName: node.displayName,
        required: credential.required !== false,
      });
      usages.set(credential.name, list);
    }
  }

  return usages;
}

function readN8nVersion() {
  try {
    const metadata = JSON.parse(fs.readFileSync(CACHE_METADATA_PATH, 'utf8'));
    return metadata.n8nVersion || metadata.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function generate() {
  const files = SCAN_DIRS.flatMap(findCredentialFiles);
  if (files.length === 0) {
    throw new Error('No n8n credential files found. Run ensure-n8n-cache.cjs first.');
  }

  const byType = new Map();
  for (const file of files) {
    try {
      const credential = extractCredential(await loadModule(file));
      if (!credential) continue;
      byType.set(credential.typeName, {
        ...credential,
        sourcePath: file.replace(ROOT_DIR, ''),
      });
    } catch (error) {
      if (process.env.DEBUG) console.warn(`Failed to load ${file}: ${error.message}`);
    }
  }

  const usages = readNodeUsages();
  const credentials = Array.from(byType.values())
    .sort((a, b) => a.typeName.localeCompare(b.typeName))
    .map((credential) => ({
      ...credential,
      usedByNodes: usages.get(credential.typeName) || [],
    }));

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    n8nVersion: readN8nVersion(),
    sourceFileCount: files.length,
    scanDirectories: SCAN_DIRS,
    credentials,
  }, null, 2));

  console.log(`💾 Saved credential ontology to: ${OUTPUT_FILE}`);
  console.log(`🔐 Extracted ${credentials.length} credential types from n8n.`);
}

if (require.main === module) {
  generate().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { generate };
