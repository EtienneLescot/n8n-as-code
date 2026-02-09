#!/usr/bin/env node
const { deleteWorkflowsByPrefix, DEFAULT_PREFIX } = require('./workflow-seeder.cjs');

// Usage:
// node scripts/pagination/delete-auto-workflows.cjs --env .env.test --confirm --prefix "Auto Workflow "
// Without --confirm it will only list matching workflows (dry-run).

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { env: '.env', confirm: false, prefix: DEFAULT_PREFIX };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--env' && args[i+1]) { out.env = args[++i]; }
    if (a === '--confirm') { out.confirm = true; }
    if (a === '--prefix' && args[i+1]) { out.prefix = args[++i]; }
  }
  return out;
}

async function main() {
  const { env, confirm, prefix } = parseArgs();

  if (!confirm) {
    console.log('Fetching workflows (dry-run)...');
    try {
      const matches = await deleteWorkflowsByPrefix({ envPath: env, prefix, confirm: false });
      if (matches.length === 0) {
        console.log(`No workflows found for prefix "${prefix}".`);
        return;
      }
      console.log(`Found ${matches.length} matching workflows:`);
      matches.forEach(w => console.log(`- ${w.name} -> id=${w.id}`));
      console.log('\nDry run: no deletions performed. Rerun with --confirm to delete the listed workflows.');
    } catch (err) {
      console.error('Failed to list workflows:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    }
    return;
  }

  console.log(`Deleting workflows using prefix "${prefix}"...`);
  try {
    const deleted = await deleteWorkflowsByPrefix({ envPath: env, prefix, confirm: true });
    console.log(`Deleted ${deleted} workflows.`);
  } catch (err) {
    console.error('Failed to delete workflows:', err.response?.status, err.response?.data || err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
