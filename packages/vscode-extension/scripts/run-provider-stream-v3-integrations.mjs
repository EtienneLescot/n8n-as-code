import { spawnSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
dotenv.config({ path: path.join(repoRoot, '.env.test'), quiet: true });

const providers = [
  { id: 'openai', envKeys: ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'] },
  { id: 'mistral', envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY', 'MISTRAL_KEY'] },
  { id: 'anthropic', envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY'] },
  { id: 'google', envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'] },
  { id: 'openrouter', envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY', 'OPEN_ROUTEUR_KEY'] },
  { id: 'atlascloud', envKeys: ['ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY'] },
  { id: 'openai-compatible', envKeys: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'] },
];

const requested = new Set((process.env.N8N_AGENT_TEST_PROVIDERS || '').split(',').map((item) => item.trim()).filter(Boolean));
const selected = providers.filter((provider) => !requested.size || requested.has(provider.id));
const skipped = selected.filter((provider) => !hasAnyEnv(provider.envKeys)).map((provider) => provider.id);
const runnable = selected.filter((provider) => hasAnyEnv(provider.envKeys));

console.log(`[provider-stream-v3] orchestrator runnable=${runnable.map((provider) => provider.id).join(',') || 'none'} skipped=${skipped.join(',') || 'none'}`);
if (!runnable.length) {
  console.error('[provider-stream-v3] No configured providers found. Add keys to .env.test or set N8N_AGENT_TEST_PROVIDERS.');
  process.exit(1);
}

const failures = [];
for (const provider of runnable) {
  const result = spawnSync('npx', ['tsx', '--test', 'tests/integration/provider-stream-v3.integration.test.ts'], {
    cwd: path.join(repoRoot, 'packages/vscode-extension'),
    env: {
      ...process.env,
      N8N_AGENT_TEST_PROVIDERS: provider.id,
    },
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (output) console.log(output);
  if (result.error) {
    failures.push(`${provider.id}: ${result.error.message}`);
    continue;
  }
  if (result.status !== 0) {
    failures.push(`${provider.id}: exited with status ${result.status}`);
  }
}

if (failures.length) {
  console.error(`[provider-stream-v3] failures:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}

console.log('[provider-stream-v3] all configured provider probes passed.');

function hasAnyEnv(keys) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}
