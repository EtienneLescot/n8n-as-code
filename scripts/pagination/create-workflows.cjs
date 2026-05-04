#!/usr/bin/env node
const { createWorkflows, DEFAULT_PREFIX } = require('./workflow-seeder.cjs');

// Simple script to create multiple workflows using n8n REST API
// Usage: node scripts/pagination/create-workflows.cjs --env .env.test --count 60 --prefix "Auto Workflow "

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { env: '.env', count: 150, prefix: DEFAULT_PREFIX };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--env' && args[i+1]) { out.env = args[++i]; }
    if (a === '--count' && args[i+1]) { out.count = parseInt(args[++i], 10); }
    if (a === '--prefix' && args[i+1]) { out.prefix = args[++i]; }
  }
  return out;
}

async function main() {
  const { env, count, prefix } = parseArgs();

  console.log(`Creating ${count} workflows using prefix "${prefix}"`);
  const created = await createWorkflows({ envPath: env, count, prefix });
  for (const wf of created) {
    console.log(`Created ${wf.name} -> id=${wf.id}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
