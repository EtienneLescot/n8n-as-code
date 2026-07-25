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
  label: string;
  envKeys: string[];
  model: string;
  baseUrl?: string;
  createModel: (config: { apiKey: string; model: string; baseUrl?: string }) => unknown;
}

interface ProviderDiagnostics {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  elapsedMs: number;
  outputResolved: boolean;
  outputSummary: string;
  protocolCounts: Record<string, number>;
  messageEvents: string[];
  toolEvents: string[];
  errors: string[];
  toolMessageTextDuplicated: boolean;
}

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
dotenv.config({ path: path.join(rootDir, '.env.test'), quiet: true });

const lateRejections: string[] = [];
process.on('unhandledRejection', (reason) => {
  lateRejections.push(reason instanceof Error ? reason.message : String(reason));
});

const providerCases: ProviderCase[] = [
  {
    id: 'openai',
    label: 'OpenAI API',
    envKeys: ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_MODEL || process.env.N8N_AGENT_TEST_OPENAI_MODEL || 'gpt-4o-mini',
    createModel: ({ apiKey, model }) => new ChatOpenAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'mistral',
    label: 'Mistral API',
    envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY', 'MISTRAL_KEY'],
    model: process.env.MISTRAL_MODEL || process.env.N8N_AGENT_TEST_MISTRAL_MODEL || 'mistral-small-latest',
    createModel: ({ apiKey, model }) => new ChatMistralAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'anthropic',
    label: 'Claude API',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY'],
    model: process.env.ANTHROPIC_MODEL || process.env.N8N_AGENT_TEST_ANTHROPIC_MODEL || 'claude-haiku-4-5',
    createModel: ({ apiKey, model }) => new ChatAnthropic({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'google',
    label: 'Gemini API',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
    model: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || process.env.N8N_AGENT_TEST_GEMINI_MODEL || 'gemini-2.5-flash',
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
    label: 'OpenRouter API',
    envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY', 'OPEN_ROUTEUR_KEY'],
    model: process.env.OPENROUTER_MODEL || process.env.N8N_AGENT_TEST_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'atlascloud',
    label: 'Atlas Cloud',
    envKeys: ['ATLASCLOUD_API_KEY', 'ATLAS_CLOUD_API_KEY'],
    model: process.env.ATLASCLOUD_MODEL || process.env.ATLAS_CLOUD_MODEL || process.env.N8N_AGENT_TEST_ATLASCLOUD_MODEL || 'deepseek-ai/deepseek-v4-pro',
    baseUrl: process.env.ATLASCLOUD_BASE_URL || process.env.ATLAS_CLOUD_BASE_URL || 'https://api.atlascloud.ai/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_COMPATIBLE_MODEL || process.env.N8N_AGENT_TEST_OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
];

test('DeepAgents v3 provider stream contract', { timeout: 360_000 }, async () => {
  const selectedProviders = new Set(
    (process.env.N8N_AGENT_TEST_PROVIDERS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const cases = providerCases.filter((provider) => !selectedProviders.size || selectedProviders.has(provider.id));
  const runnable = cases
    .map((provider) => ({ provider, apiKey: readFirstEnv(provider.envKeys) }))
    .filter((entry) => Boolean(entry.apiKey));
  const skipped = cases.filter((provider) => !readFirstEnv(provider.envKeys)).map((provider) => provider.id);

  console.log(`[provider-stream-v3] configured=${runnable.map((entry) => entry.provider.id).join(',') || 'none'} skipped=${skipped.join(',') || 'none'}`);
  assert.ok(runnable.length > 0, 'No provider API keys found in .env.test for selected provider cases');

  const diagnostics: ProviderDiagnostics[] = [];
  const failures: string[] = [];
  for (const entry of runnable) {
    const provider = entry.provider;
    const startedAt = Date.now();
    try {
      const result = await runProviderStreamProbe(provider, entry.apiKey as string);
      diagnostics.push(result);
      console.log(formatDiagnostics(result));
      assert.ok(result.outputResolved, `${provider.id}: run.output did not resolve`);
      assert.ok(result.protocolCounts.tools > 0, `${provider.id}: no v3 tools protocol events were observed`);
      assert.equal(result.toolMessageTextDuplicated, false, `${provider.id}: tool output was also emitted through message text projection`);
    } catch (error: any) {
      const elapsedMs = Date.now() - startedAt;
      const message = `${provider.id}: failed after ${elapsedMs}ms: ${error?.message || String(error)}`;
      failures.push(message);
      console.log(`[provider-stream-v3] ${message}`);
    }
  }

  if (failures.length) {
    const late = lateRejections.length
      ? `\nLate stream rejections:\n${lateRejections.map((failure) => `- ${failure}`).join('\n')}`
      : '';
    assert.fail(`Provider stream v3 integration failures:\n${failures.map((failure) => `- ${failure}`).join('\n')}${late}`);
  }
});

async function runProviderStreamProbe(provider: ProviderCase, apiKey: string): Promise<ProviderDiagnostics> {
  const effectiveModel = provider.model;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `n8nac-provider-${provider.id}-`));
  const startedAt = Date.now();
  const toolOutputMarker = `PROVIDER_TOOL_MARKER_${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const diagnostics: ProviderDiagnostics = {
    provider: provider.id,
    model: effectiveModel,
    baseUrl: provider.baseUrl,
    elapsedMs: 0,
    outputResolved: false,
    outputSummary: '',
    protocolCounts: {},
    messageEvents: [],
    toolEvents: [],
    errors: [],
    toolMessageTextDuplicated: false,
  };

  try {
    const backend = await LocalShellBackend.create({
      rootDir: tempDir,
      inheritEnv: false,
      env: { PATH: process.env.PATH || '/usr/bin:/bin' },
    });
    const model = provider.createModel({ apiKey, model: effectiveModel, baseUrl: provider.baseUrl });
    const agent = createDeepAgent({
      model: model as any,
      backend,
      middleware: [createProviderMessageCompatibilityMiddleware()],
      systemPrompt: 'You are testing a stream integration. Use tools when the user asks you to read a file. Keep final answers short.',
    });
    const run = await (agent as any).streamEvents({
      messages: [{ role: 'user', content: `Use the write_file tool to write ${toolOutputMarker} to provider-smoke.txt, then use read_file to read provider-smoke.txt, then answer exactly PROVIDER_STREAM_OK. Do not quote the file contents in the final answer.` }],
    }, {
      version: 'v3',
      configurable: { thread_id: `provider-stream-${provider.id}-${Date.now()}` },
    });

    const protocolPromise = consumeProtocolEvents(run, diagnostics, toolOutputMarker);
    const messagePromise = consumeMessageProjection(run, diagnostics, toolOutputMarker);
    try {
      const output = await withTimeout(Promise.resolve(run.output), 120_000, () => {
        if (typeof run.abort === 'function') run.abort(new Error('provider stream integration timeout'));
      });
      diagnostics.outputResolved = true;
      diagnostics.outputSummary = summarizeOutput(output);
    } catch (error: any) {
      diagnostics.errors.push(error?.message || String(error));
      if (typeof run.abort === 'function') run.abort(error);
      throw error;
    } finally {
      const settled = await Promise.allSettled([protocolPromise, messagePromise]);
      for (const result of settled) {
        if (result.status === 'rejected') diagnostics.errors.push(result.reason?.message || String(result.reason));
      }
    }
    return diagnostics;
  } catch (error: any) {
    diagnostics.elapsedMs = Date.now() - startedAt;
    console.log(formatDiagnostics(diagnostics));
    throw error;
  } finally {
    diagnostics.elapsedMs = Date.now() - startedAt;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createProviderMessageCompatibilityMiddleware(): unknown {
  return createMiddleware({
    name: 'ProviderMessageCompatibilityProbe',
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

async function consumeProtocolEvents(run: AsyncIterable<any>, diagnostics: ProviderDiagnostics, toolOutputMarker: string): Promise<void> {
  for await (const event of run) {
    const method = String(event?.method || 'unknown');
    diagnostics.protocolCounts[method] = (diagnostics.protocolCounts[method] || 0) + 1;
    if (method !== 'tools') continue;
    const data = event?.params?.data;
    const toolEvent = String(data?.event || 'unknown');
    const toolName = String(data?.tool_name || data?.name || 'unknown');
    diagnostics.toolEvents.push(`${toolEvent}:${toolName}`);
    const payload = JSON.stringify(data ?? {});
    if (payload.includes(toolOutputMarker)) diagnostics.protocolCounts.toolMarker = (diagnostics.protocolCounts.toolMarker || 0) + 1;
  }
}

async function consumeMessageProjection(run: { messages?: AsyncIterable<any> }, diagnostics: ProviderDiagnostics, toolOutputMarker: string): Promise<void> {
  if (!run.messages) return;
  for await (const message of run.messages) {
    const node = String((message as any)?.node || 'none');
    const namespace = Array.isArray((message as any)?.namespace) ? (message as any).namespace.join('/') : 'none';
    diagnostics.messageEvents.push(`message:${node}:${namespace}`);
    if (isToolMessageProjection(message)) continue;
    let text = '';
    if (message && typeof message[Symbol.asyncIterator] === 'function') {
      for await (const event of message) {
        diagnostics.messageEvents.push(String(event?.event || 'unknown'));
        const delta = event?.delta?.text || event?.content?.text;
        if (typeof delta === 'string') text += delta;
      }
    } else if (message?.text) {
      for await (const delta of message.text) text += String(delta);
    }
    if (text.includes(toolOutputMarker)) diagnostics.toolMessageTextDuplicated = true;
  }
}

function isToolMessageProjection(message: any): boolean {
  const node = String(message?.node || '').toLowerCase();
  if (node === 'tools' || node.endsWith(':tools') || node.endsWith('/tools')) return true;
  const namespace = Array.isArray(message?.namespace) ? message.namespace.map(String) : [];
  return namespace.some((part) => {
    const normalized = part.toLowerCase();
    return normalized === 'tools' || normalized.startsWith('tools:') || normalized.endsWith(':tools');
  });
}

function readFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function summarizeOutput(output: unknown): string {
  const text = extractText(output) || JSON.stringify(output, replacer, 2) || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function extractText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n');
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, any>;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  if (Array.isArray(record.content)) return extractText(record.content);
  if (Array.isArray(record.messages)) return extractText(record.messages[record.messages.length - 1]);
  return undefined;
}

function replacer(key: string, value: unknown): unknown {
  if (/key|token|secret|auth|credential/i.test(key)) return '[redacted]';
  return value;
}

function formatDiagnostics(diagnostics: ProviderDiagnostics): string {
  return [
    `[provider-stream-v3] provider=${diagnostics.provider}`,
    `model=${diagnostics.model}`,
    `elapsedMs=${diagnostics.elapsedMs}`,
    `counts=${JSON.stringify(diagnostics.protocolCounts)}`,
    `tools=${diagnostics.toolEvents.slice(0, 12).join('|') || 'none'}`,
    `messages=${diagnostics.messageEvents.slice(0, 12).join('|') || 'none'}`,
    `duplicatedToolText=${diagnostics.toolMessageTextDuplicated}`,
    `errors=${diagnostics.errors.map((error) => JSON.stringify(error.slice(0, 180))).join('|') || 'none'}`,
    `output=${JSON.stringify(diagnostics.outputSummary)}`,
  ].join(' ');
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
