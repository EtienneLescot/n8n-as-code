import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';
import { LocalShellBackend, createDeepAgent } from 'deepagents';
import { shouldDisableModelStreamingForToolCalling } from '../../src/services/agent-provider-capabilities.js';

type ProviderId = 'openai' | 'mistral' | 'anthropic' | 'google' | 'openrouter' | 'atlascloud' | 'openai-compatible';

interface ProviderCase {
  id: ProviderId;
  envKeys: string[];
  model: string;
  baseUrl?: string;
  createModel: (config: { apiKey: string; model: string; baseUrl?: string }) => unknown;
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
dotenv.config({ path: path.join(rootDir, '.env.test'), quiet: true });

const providerCases: ProviderCase[] = [
  {
    id: 'openai',
    envKeys: ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_MODEL || process.env.N8N_AGENT_TEST_OPENAI_MODEL || 'gpt-4o-mini',
    createModel: ({ apiKey, model }) => new ChatOpenAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'mistral',
    envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY', 'MISTRAL_KEY'],
    model: process.env.MISTRAL_MODEL || process.env.N8N_AGENT_TEST_MISTRAL_MODEL || 'mistral-large-latest',
    createModel: ({ apiKey, model }) => new ChatMistralAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'anthropic',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY'],
    model: process.env.ANTHROPIC_MODEL || process.env.N8N_AGENT_TEST_ANTHROPIC_MODEL || 'claude-haiku-4-5',
    createModel: ({ apiKey, model }) => new ChatAnthropic({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'google',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
    model: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || process.env.N8N_AGENT_TEST_GEMINI_MODEL || 'gemini-3-flash-preview',
    baseUrl: process.env.GEMINI_BASE_URL || process.env.GOOGLE_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({
      apiKey,
      model,
      temperature: 0,
      configuration: { baseURL: baseUrl },
      ...(shouldDisableModelStreamingForToolCalling('google', model) ? { disableStreaming: true } : {}),
    }),
  },
  {
    id: 'openrouter',
    envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY', 'OPEN_ROUTEUR_KEY'],
    model: process.env.OPENROUTER_MODEL || process.env.N8N_AGENT_TEST_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'atlascloud',
    envKeys: ['ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY'],
    model: process.env.ATLASCLOUD_MODEL || process.env.ATLAS_CLOUD_MODEL || process.env.N8N_AGENT_TEST_ATLASCLOUD_MODEL || 'deepseek-ai/deepseek-v4-pro',
    baseUrl: process.env.ATLASCLOUD_BASE_URL || process.env.ATLAS_CLOUD_BASE_URL || 'https://api.atlascloud.ai/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'openai-compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_COMPATIBLE_MODEL || process.env.N8N_AGENT_TEST_OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
];

test('tool usage authoring: creates a TypeScript n8n-as-code workflow', { timeout: 240_000 }, async () => {
  const requested = new Set((process.env.N8N_AGENT_AUTHORING_TEST_PROVIDERS || process.env.N8N_AGENT_TEST_PROVIDERS || 'mistral')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
  const cases = providerCases.filter((provider) => requested.has(provider.id));
  const runnable = cases.map((provider) => ({ provider, apiKey: readFirstEnv(provider.envKeys) })).filter((entry) => Boolean(entry.apiKey));
  assert.ok(runnable.length > 0, 'No provider API keys found for selected authoring provider cases');

  const failures: string[] = [];
  for (const entry of runnable) {
    try {
      const result = await runAuthoringProbe(entry.provider, entry.apiKey as string);
      console.log(`[tool-usage-authoring] provider=${entry.provider.id} model=${entry.provider.model} elapsedMs=${result.elapsedMs} repairAttempts=${result.repairAttempts} tools=${result.toolEvents.join('|') || 'none'} output=${JSON.stringify(result.outputSummary)}`);
    } catch (error: any) {
      failures.push(`${entry.provider.id}: ${error?.message || String(error)}`);
    }
  }

  if (failures.length) {
    assert.fail(`Tool usage authoring failures:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
});

async function runAuthoringProbe(provider: ProviderCase, apiKey: string): Promise<{ elapsedMs: number; outputSummary: string; toolEvents: string[]; repairAttempts: number }> {
  const startedAt = Date.now();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `n8nac-authoring-${provider.id}-`));
  const workflowPath = path.join(tempDir, 'workflows', 'dev', 'single-node.workflow.ts');
  const jsonWorkflowPath = path.join(tempDir, 'workflows', 'dev', 'single-node.workflow.json');
  const toolEvents: string[] = [];
  try {
    fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), [
      '# n8n-as-code authoring rules',
      'When asked to create a workflow, create TypeScript n8n-as-code source files only.',
      'Never create raw n8n JSON workflows unless the user explicitly asks for JSON export.',
      'Use decorators imported from @n8n-as-code/transformer: @workflow, @node, and @links.',
      'Do not invent createWorkflow, defineWorkflow, workflowJson, or raw nodes/connections object helpers.',
      'A one-node workflow must use n8n-nodes-base.manualTrigger and version 1.',
      'Write workflow source to /workflows/dev/single-node.workflow.ts.',
      '',
      'Canonical minimal file shape:',
      '```ts',
      "import { workflow, node, links } from '@n8n-as-code/transformer';",
      '',
      '@workflow({',
      "  name: 'Single Node Workflow',",
      '  active: false,',
      '})',
      'export class SingleNodeWorkflow {',
      '  @node({',
      "    name: 'Manual Trigger',",
      "    type: 'n8n-nodes-base.manualTrigger',",
      '    version: 1,',
      '  })',
      '  ManualTrigger = {};',
      '',
      '  @links()',
      '  defineRouting() {}',
      '}',
      '```',
    ].join('\n'));

    const backend = await LocalShellBackend.create({
      rootDir: tempDir,
      inheritEnv: false,
      env: { PATH: process.env.PATH || '/usr/bin:/bin' },
    });
    const model = provider.createModel({ apiKey, model: provider.model, baseUrl: provider.baseUrl });
    const agent = createDeepAgent({
      model: model as any,
      backend,
      memory: [path.join(tempDir, 'AGENTS.md')],
      middleware: [createProviderMessageCompatibilityMiddleware()],
      systemPrompt: [
        'You are an n8n-as-code workflow authoring agent.',
        `Filesystem paths are real workspace paths. Use either relative paths or absolute paths under ${tempDir}.`,
        `The target workflow path is ${workflowPath}. Do not write to /workflows/dev/single-node.workflow.ts unless the workspace root is /.`,
        'For workflow creation, use write_file to create TypeScript n8n-as-code source. Do not create JSON.',
        'Use the exact decorator-based shape from AGENTS.md. Do not invent createWorkflow or raw workflow object helpers.',
      ].join('\n'),
    });
    const threadId = `tool-authoring-${provider.id}-${Date.now()}`;
    let output: unknown;
    let repairAttempts = 0;
    output = await runAgentTurn(agent, threadId, `Create a tiny workflow with exactly one Manual Trigger node. Follow AGENTS.md. Write the result to ${workflowPath}. Then stop.`, toolEvents);
    let validation = validateWorkflowFile(provider.id, workflowPath, jsonWorkflowPath);
    while (validation.issues.length && repairAttempts < 2) {
      repairAttempts += 1;
      const currentContent = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
      output = await runAgentTurn(agent, threadId, [
        `The workflow file is invalid. Repair it now by replacing ${workflowPath} with decorator-based TypeScript only.`,
        'Validation issues:',
        ...validation.issues.map((issue) => `- ${issue}`),
        'Current invalid content:',
        '```ts',
        currentContent.slice(0, 4000),
        '```',
        'Use this exact canonical shape, adapted only for names:',
        '```ts',
        canonicalWorkflowSource(),
        '```',
        'Call write_file with the corrected full file content. Do not create JSON. Do not stop before writing the corrected file.',
      ].join('\n'), toolEvents);
      validation = validateWorkflowFile(provider.id, workflowPath, jsonWorkflowPath);
    }
    assert.deepEqual(validation.issues, [], `${provider.id}: workflow authoring validation failed after repairs. Issues: ${validation.issues.join('; ')}. Content excerpt: ${validation.contentExcerpt}`);
    assert.ok(toolEvents.some((event) => event.startsWith('tool-started:write_file')), `${provider.id}: expected write_file tool usage`);

    return { elapsedMs: Date.now() - startedAt, outputSummary: summarizeOutput(output), toolEvents, repairAttempts };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runAgentTurn(agent: any, threadId: string, prompt: string, toolEvents: string[]): Promise<unknown> {
  const run = await agent.streamEvents({ messages: [{ role: 'user', content: prompt }] }, {
    version: 'v3',
    configurable: { thread_id: threadId },
  });
  const protocolPromise = collectToolEvents(run, toolEvents);
  try {
    return await Promise.resolve(run.output);
  } finally {
    await Promise.allSettled([protocolPromise]);
  }
}

function validateWorkflowFile(provider: ProviderId, workflowPath: string, jsonWorkflowPath: string): { issues: string[]; contentExcerpt: string } {
  const issues: string[] = [];
  if (!fs.existsSync(workflowPath)) issues.push(`expected workflow TypeScript file to be created at ${workflowPath}`);
  if (fs.existsSync(jsonWorkflowPath)) issues.push('must not create raw JSON workflow file');
  const content = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
  if (!/@workflow\s*\(/.test(content)) issues.push('TypeScript workflow must use @workflow decorator');
  if (!/@node\s*\(/.test(content)) issues.push('TypeScript workflow must use @node decorator');
  if (!/@links\s*\(/.test(content)) issues.push('TypeScript workflow must include @links routing decorator');
  if (!/n8n-nodes-base\.manualTrigger/.test(content)) issues.push('workflow must create a Manual Trigger node');
  if (/^\s*\{[\s\S]*"nodes"\s*:/.test(content)) issues.push('workflow file must not be raw n8n JSON');
  if (/createWorkflow|defineWorkflow|workflowJson/.test(content)) issues.push('workflow file must not use invented workflow helper APIs');
  return { issues: issues.map((issue) => `${provider}: ${issue}`), contentExcerpt: content.slice(0, 1000) };
}

function canonicalWorkflowSource(): string {
  return `import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Single Node Workflow',
  active: false,
})
export class SingleNodeWorkflow {
  @node({
    name: 'Manual Trigger',
    type: 'n8n-nodes-base.manualTrigger',
    version: 1,
  })
  ManualTrigger = {};

  @links()
  defineRouting() {}
}
`;
}

async function collectToolEvents(run: AsyncIterable<any>, toolEvents: string[]): Promise<void> {
  for await (const event of run) {
    if (event?.method !== 'tools') continue;
    const data = event?.params?.data;
    toolEvents.push(`${String(data?.event || 'unknown')}:${String(data?.tool_name || data?.name || 'unknown')}`);
  }
}

function createProviderMessageCompatibilityMiddleware(): unknown {
  return createMiddleware({
    name: 'ProviderMessageCompatibilityAuthoringProbe',
    wrapModelCall: async (request: any, handler: (request: any) => Promise<unknown>) => {
      const messages = Array.isArray(request?.messages) ? request.messages : undefined;
      if (!messages?.length) return handler(request);
      return handler({ ...request, messages: messages.map(normalizeProviderMessage) });
    },
  });
}

function normalizeProviderMessage(message: any): any {
  if (AIMessage.isInstance(message)) {
    const rawToolCalls = extractRawProviderToolCalls(message);
    return new AIMessage({
      id: message.id,
      name: message.name,
      content: extractTextContent(message),
      tool_calls: rawToolCalls.length ? [] : extractToolCalls(message),
      additional_kwargs: rawToolCalls.length
        ? { ...omitOutputVersion(message.additional_kwargs), tool_calls: rawToolCalls }
        : omitToolCalls(message.additional_kwargs),
      response_metadata: omitOutputVersion(message.response_metadata),
    });
  }
  if (ToolMessage.isInstance(message)) {
    return new ToolMessage({
      id: message.id,
      name: message.name,
      content: extractTextContent(message),
      tool_call_id: message.tool_call_id,
      additional_kwargs: message.additional_kwargs,
      response_metadata: omitOutputVersion(message.response_metadata),
    });
  }
  if (SystemMessage.isInstance(message) || HumanMessage.isInstance(message)) {
    if (!hasUnsupportedComplexContent(message)) return message;
    const MessageClass = SystemMessage.isInstance(message) ? SystemMessage : HumanMessage;
    return new MessageClass({
      id: message.id,
      name: message.name,
      content: extractTextContent(message),
      additional_kwargs: message.additional_kwargs,
      response_metadata: omitOutputVersion(message.response_metadata),
    });
  }
  return message;
}

function extractToolCalls(message: any): Array<{ id?: string; name: string; args: unknown; type?: 'tool_call' }> {
  const existing = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const blocks = getContentBlocks(message);
  const fromBlocks = blocks
    .filter((block: any) => block?.type === 'tool_call')
    .map((block: any) => ({ id: block.id, name: block.name || 'tool', args: block.args ?? block.input ?? {}, type: 'tool_call' as const }));
  const seen = new Set(existing.map((toolCall: any) => `${toolCall.id || ''}:${toolCall.name || ''}`));
  return [...existing, ...fromBlocks.filter((toolCall) => {
    const key = `${toolCall.id || ''}:${toolCall.name || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

function extractRawProviderToolCalls(message: any): any[] {
  const rawToolCalls = message?.additional_kwargs?.tool_calls;
  if (!Array.isArray(rawToolCalls)) return [];
  return rawToolCalls.filter((toolCall) => toolCall && typeof toolCall === 'object' && toolCall.extra_content && typeof toolCall.extra_content === 'object');
}

function extractTextContent(message: any): string {
  return getContentBlocks(message)
    .map((block: any) => typeof block === 'string' ? block : typeof block?.text === 'string' ? block.text : typeof block?.content === 'string' ? block.content : '')
    .filter(Boolean)
    .join('\n');
}

function getContentBlocks(message: any): any[] {
  if (Array.isArray(message?.contentBlocks)) return message.contentBlocks;
  if (Array.isArray(message?.content)) return message.content;
  if (typeof message?.content === 'string') return [{ type: 'text', text: message.content }];
  return [];
}

function hasUnsupportedComplexContent(message: any): boolean {
  return getContentBlocks(message).some((block: any) => block && typeof block === 'object' && typeof block.type === 'string' && block.type !== 'text' && block.type !== 'image_url');
}

function omitToolCalls(value: any): any {
  if (!value || typeof value !== 'object') return value;
  const { tool_calls: _toolCalls, ...rest } = value;
  return rest;
}

function omitOutputVersion(value: any): any {
  if (!value || typeof value !== 'object') return value;
  const { output_version: _outputVersion, ...rest } = value;
  return rest;
}

function readFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function summarizeOutput(output: unknown): string {
  if (!output) return '';
  const text = typeof output === 'string' ? output : JSON.stringify(output, (_, value) => value, 2);
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}
