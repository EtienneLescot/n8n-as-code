import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { shouldDisableModelStreamingForToolCalling } from '../../src/services/agent-provider-capabilities.js';
import { N8nAsCodeMcpService } from '../../../mcp/src/services/mcp-service.js';
import { NATIVE_MCP_READ_ONLY_TOOL_MAP } from '../../../mcp/src/services/native-mcp-tools.js';

type ProviderId = 'openai' | 'mistral' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible';

interface ProviderCase {
  id: ProviderId;
  envKeys: string[];
  model: string;
  baseUrl?: string;
  createModel: (config: { apiKey: string; model: string; baseUrl?: string }) => any;
}

interface NativeMcpLiveConfig {
  endpoint: string;
  token: string;
  timeoutMs: number;
  workflowSearchQuery?: string;
  workflowSearchLimit: number;
  nodeSearchQueries: string[];
  sdkReferenceSection: 'patterns' | 'expressions' | 'functions' | 'rules' | 'import' | 'guidelines' | 'design' | 'all';
}

interface RoutingCase {
  name: string;
  prompt: string;
  expectedTool: string;
  forbiddenTools?: string[];
  requireStatusBeforeExpected?: boolean;
}

interface AgentRoutingResult {
  provider: ProviderId;
  model: string;
  elapsedMs: number;
  toolCalls: Array<{ name: string; args: unknown }>;
  finalText: string;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env.test'), quiet: true });

const providerCases: ProviderCase[] = [
  {
    id: 'openai',
    envKeys: ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_OPENAI_MODEL || process.env.N8N_AGENT_TEST_OPENAI_MODEL || 'gpt-4o-mini',
    createModel: ({ apiKey, model }) => new ChatOpenAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'mistral',
    envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY', 'MISTRAL_KEY'],
    model: process.env.MISTRAL_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_MISTRAL_MODEL || process.env.N8N_AGENT_TEST_MISTRAL_MODEL || 'mistral-large-latest',
    createModel: ({ apiKey, model }) => new ChatMistralAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'anthropic',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY'],
    model: process.env.ANTHROPIC_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_ANTHROPIC_MODEL || process.env.N8N_AGENT_TEST_ANTHROPIC_MODEL || 'claude-haiku-4-5',
    createModel: ({ apiKey, model }) => new ChatAnthropic({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'google',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
    model: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_GEMINI_MODEL || process.env.N8N_AGENT_TEST_GEMINI_MODEL || 'gemini-3-flash-preview',
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
    model: process.env.OPENROUTER_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_OPENROUTER_MODEL || process.env.N8N_AGENT_TEST_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'openai-compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_COMPATIBLE_MODEL || process.env.N8N_NATIVE_MCP_AGENT_TEST_OPENAI_COMPATIBLE_MODEL || process.env.N8N_AGENT_TEST_OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
];

test('native MCP live LLM agent routes tool calls by use case', { timeout: 360_000 }, async (t) => {
  const nativeConfig = readNativeMcpLiveConfig();
  if (!nativeConfig) {
    t.skip('Missing NATIVE_MCP_URL and NATIVE_MCP_KEY in .env.test');
    return;
  }

  const requested = new Set((process.env.N8N_NATIVE_MCP_AGENT_TEST_PROVIDERS || process.env.N8N_AGENT_TEST_PROVIDERS || 'mistral')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
  const selectedProviders = providerCases.filter((provider) => requested.has(provider.id));
  const runnable = selectedProviders
    .map((provider) => ({ provider, apiKey: readFirstEnv(provider.envKeys) }))
    .filter((entry) => Boolean(entry.apiKey));

  if (!runnable.length) {
    t.skip(`Missing LLM provider credentials for selected native MCP routing providers: ${[...requested].join(',') || 'none'}`);
    return;
  }

  const service = new N8nAsCodeMcpService({
    cwd: repoRoot,
    nativeMcpEnv: {
      N8NAC_NATIVE_MCP_ENABLED: '1',
      N8NAC_NATIVE_MCP_MODE: 'assist',
      N8N_NATIVE_MCP_URL: nativeConfig.endpoint,
      N8N_NATIVE_MCP_TOKEN: nativeConfig.token,
      N8NAC_NATIVE_MCP_TIMEOUT_MS: String(nativeConfig.timeoutMs),
      N8NAC_NATIVE_MCP_ALLOW_EXECUTION_DATA: '0',
      N8NAC_NATIVE_MCP_ALLOW_REMOTE: '0',
    },
  });
  const status = await service.getNativeMcpStatus({ includeTools: true });
  assert.equal(status.connection.ok, true, `Native MCP status failed: ${redactSensitiveText(status.connection.error || 'unknown error', nativeConfig.token)}`);

  const tools = createRoutingTools(service, nativeConfig);
  const routingCases = createRoutingCases(nativeConfig);
  const failures: string[] = [];

  for (const entry of runnable) {
    for (const routingCase of routingCases) {
      try {
        const result = await runToolCallingAgent(entry.provider, entry.apiKey as string, tools, routingCase);
        assertRoutingResult(routingCase, result);
        console.log(`[native-mcp-agent-routing] provider=${result.provider} model=${result.model} case=${routingCase.name} elapsedMs=${result.elapsedMs} tools=${result.toolCalls.map((call) => call.name).join('|')} final=${JSON.stringify(result.finalText.slice(0, 240))}`);
      } catch (error: any) {
        failures.push(`${entry.provider.id}/${routingCase.name}: ${redactSensitiveText(error?.message || String(error), nativeConfig.token)}`);
      }
    }
  }

  if (failures.length) {
    assert.fail(`Native MCP LLM agent routing failures:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  }
});

async function runToolCallingAgent(provider: ProviderCase, apiKey: string, tools: StructuredToolInterface[], routingCase: RoutingCase): Promise<AgentRoutingResult> {
  const startedAt = Date.now();
  const model = provider.createModel({ apiKey, model: provider.model, baseUrl: provider.baseUrl });
  assert.equal(typeof model.bindTools, 'function', `${provider.id} model does not support bindTools`);
  const toolByName = new Map(tools.map((item) => [item.name, item]));
  const boundModel = model.bindTools(tools);
  const messages: any[] = [
    new SystemMessage([
      'You are an n8n-as-code routing agent. Choose tools according to these rules.',
      'Use native n8n MCP tools only for live n8n instance discovery, native node definitions, SDK/reference lookup, credential metadata, execution inspection, or server-side native validation.',
      'Before relying on a native n8n MCP tool, call get_n8n_native_mcp_status with includeTools=true.',
      'Use local n8n-as-code tools for code-first authoring, local .workflow.ts validation, bundled knowledge, local filesystem work, and GitOps workflows.',
      'Do not use native n8n MCP tools for local code-first authoring unless the user explicitly asks for native workflow-builder validation.',
      'When a tool result answers the request, provide a concise final answer and stop.',
    ].join('\n')),
    new HumanMessage(routingCase.prompt),
  ];
  const toolCalls: Array<{ name: string; args: unknown }> = [];

  for (let step = 0; step < 4; step += 1) {
    const response = await boundModel.invoke(messages);
    const calls = extractToolCalls(response);
    messages.push(response);

    if (!calls.length) {
      return {
        provider: provider.id,
        model: provider.model,
        elapsedMs: Date.now() - startedAt,
        toolCalls,
        finalText: extractTextContent(response),
      };
    }

    for (const call of calls) {
      const selectedTool = toolByName.get(call.name);
      assert.ok(selectedTool, `${provider.id} selected unknown tool ${call.name}`);
      toolCalls.push({ name: call.name, args: call.args || {} });
      const output = await selectedTool.invoke(call.args || {});
      messages.push(new ToolMessage({
        name: call.name,
        tool_call_id: call.id || `${call.name}-${step}`,
        content: summarizeToolOutput(output),
      }));
    }
  }

  return {
    provider: provider.id,
    model: provider.model,
    elapsedMs: Date.now() - startedAt,
    toolCalls,
    finalText: 'max tool-calling steps reached',
  };
}

function createRoutingTools(service: N8nAsCodeMcpService, config: NativeMcpLiveConfig): StructuredToolInterface[] {
  return [
    tool(async (input: any) => summarizeNativeStatus(await service.getNativeMcpStatus({ includeTools: input?.includeTools !== false })), {
      name: 'get_n8n_native_mcp_status',
      description: 'Check whether optional native n8n MCP live assist is configured and which live tools are available. Use before native live n8n MCP calls.',
      schema: objectSchema({ includeTools: { type: 'boolean', description: 'Include live native tool discovery.' } }),
    }),
    tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveWorkflows, stripUndefined({
      query: input?.query || config.workflowSearchQuery,
      limit: input?.limit || config.workflowSearchLimit,
    }))), {
      name: 'search_n8n_live_workflows',
      description: 'Search workflows that exist right now in the connected live n8n instance through native MCP. Use for live workflow discovery, not local authoring.',
      schema: objectSchema({
        query: { type: 'string', description: 'Optional workflow search query.' },
        limit: { type: 'number', description: 'Maximum number of live workflows.' },
      }),
    }),
    tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.searchNativeNodes, {
      queries: Array.isArray(input?.queries) && input.queries.length ? input.queries : config.nodeSearchQueries,
    })), {
      name: 'search_n8n_native_nodes',
      description: 'Search live native n8n node definitions through native MCP. Use when the user asks for live/native node availability or definitions from the connected instance.',
      schema: objectSchema({ queries: { type: 'array', items: { type: 'string' }, description: 'Node search queries.' } }),
    }),
    tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeSdkReference, {
      section: input?.section || config.sdkReferenceSection,
    })), {
      name: 'get_n8n_native_sdk_reference',
      description: 'Read native n8n workflow-builder SDK/reference knowledge through native MCP. Use for native SDK/reference questions, not local workflow file validation.',
      schema: objectSchema({ section: { type: 'string', enum: ['patterns', 'expressions', 'functions', 'rules', 'import', 'guidelines', 'design', 'all'] } }),
    }),
    tool(async () => JSON.stringify({ valid: true, source: 'local-n8n-as-code', errors: [], warnings: [] }), {
      name: 'validate_n8n_workflow',
      description: 'Validate local n8n-as-code workflow source files or local JSON workflow content. Use for code-first authoring and local .workflow.ts validation instead of native MCP.',
      schema: objectSchema({
        workflowContent: { type: 'string', description: 'Local workflow TypeScript or JSON content.' },
        format: { type: 'string', enum: ['auto', 'json', 'typescript'] },
      }, ['workflowContent']),
    }),
  ] as StructuredToolInterface[];
}

function createRoutingCases(config: NativeMcpLiveConfig): RoutingCase[] {
  const workflowQuery = config.workflowSearchQuery ? ` matching ${JSON.stringify(config.workflowSearchQuery)}` : '';
  return [
    {
      name: 'live-workflow-discovery',
      prompt: `I need to find workflows${workflowQuery} that exist right now in the connected n8n instance. Use the appropriate tool and summarize the result.`,
      expectedTool: 'search_n8n_live_workflows',
      forbiddenTools: ['validate_n8n_workflow', 'search_n8n_native_nodes', 'get_n8n_native_sdk_reference'],
      requireStatusBeforeExpected: true,
    },
    {
      name: 'live-native-node-discovery',
      prompt: `I need live native n8n node definitions for ${config.nodeSearchQueries.join(', ')} from the connected instance. Use the appropriate tool and summarize the result.`,
      expectedTool: 'search_n8n_native_nodes',
      forbiddenTools: ['validate_n8n_workflow', 'search_n8n_live_workflows', 'get_n8n_native_sdk_reference'],
      requireStatusBeforeExpected: true,
    },
    {
      name: 'native-sdk-reference',
      prompt: `I need the native n8n workflow-builder SDK reference for the ${config.sdkReferenceSection} section. Use the appropriate tool and summarize the result.`,
      expectedTool: 'get_n8n_native_sdk_reference',
      forbiddenTools: ['validate_n8n_workflow', 'search_n8n_live_workflows', 'search_n8n_native_nodes'],
      requireStatusBeforeExpected: true,
    },
    {
      name: 'local-code-first-authoring',
      prompt: [
        'Validate this local n8n-as-code TypeScript workflow source. This is local code-first authoring, not native workflow-builder code and not live n8n discovery.',
        'Use the appropriate local n8n-as-code validation tool and summarize whether it is valid.',
        '```ts',
        "import { workflow, node, links } from '@n8n-as-code/transformer';",
        '@workflow({ name: \'Local Manual Trigger\', active: false })',
        'export class LocalManualTrigger {',
        "  @node({ name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', version: 1 })",
        '  ManualTrigger = {};',
        '  @links()',
        '  defineRouting() {}',
        '}',
        '```',
      ].join('\n'),
      expectedTool: 'validate_n8n_workflow',
      forbiddenTools: ['get_n8n_native_mcp_status', 'search_n8n_live_workflows', 'search_n8n_native_nodes', 'get_n8n_native_sdk_reference'],
      requireStatusBeforeExpected: false,
    },
  ];
}

function assertRoutingResult(routingCase: RoutingCase, result: AgentRoutingResult): void {
  const names = result.toolCalls.map((call) => call.name);
  assert.ok(names.includes(routingCase.expectedTool), diagnostics(routingCase, result));
  for (const forbidden of routingCase.forbiddenTools || []) {
    assert.equal(names.includes(forbidden), false, diagnostics(routingCase, result));
  }
  if (routingCase.requireStatusBeforeExpected) {
    const statusIndex = names.indexOf('get_n8n_native_mcp_status');
    const expectedIndex = names.indexOf(routingCase.expectedTool);
    assert.ok(statusIndex >= 0 && expectedIndex >= 0 && statusIndex < expectedIndex, diagnostics(routingCase, result));
  }
}

function readNativeMcpLiveConfig(): NativeMcpLiveConfig | undefined {
  const endpoint = firstString(process.env.NATIVE_MCP_URL);
  const token = normalizeNativeMcpToken(firstString(process.env.NATIVE_MCP_KEY));
  if (!endpoint || !token) return undefined;
  return {
    endpoint,
    token,
    timeoutMs: readPositiveInteger('NATIVE_MCP_TIMEOUT_MS') || 30_000,
    workflowSearchQuery: firstString(process.env.NATIVE_MCP_WORKFLOW_QUERY),
    workflowSearchLimit: readPositiveInteger('NATIVE_MCP_WORKFLOW_LIMIT') || 5,
    nodeSearchQueries: firstStringArray(process.env.NATIVE_MCP_NODE_QUERIES) || ['manual trigger'],
    sdkReferenceSection: normalizeSdkReferenceSection(firstString(process.env.NATIVE_MCP_SDK_REFERENCE_SECTION)),
  };
}

function extractToolCalls(message: any): Array<{ id?: string; name: string; args: any }> {
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    return message.tool_calls.map((call: any) => ({ id: call.id, name: call.name, args: call.args ?? {} })).filter((call: any) => call.name);
  }
  const rawToolCalls = message?.additional_kwargs?.tool_calls;
  if (Array.isArray(rawToolCalls) && rawToolCalls.length) {
    return rawToolCalls.map((call: any) => {
      const fn = call.function || call.extra_content?.function || {};
      return {
        id: call.id,
        name: fn.name || call.name,
        args: parseJsonObject(fn.arguments) || {},
      };
    }).filter((call: any) => call.name);
  }
  return getContentBlocks(message)
    .filter((block: any) => block?.type === 'tool_call')
    .map((block: any) => ({ id: block.id, name: block.name || 'tool', args: block.args ?? block.input ?? {} }))
    .filter((call: any) => call.name);
}

function summarizeNativeStatus(status: any): string {
  return JSON.stringify({
    enabled: status?.config?.enabled,
    configured: status?.config?.configured,
    connectionOk: status?.connection?.ok,
    toolNames: status?.tools?.names || [],
    capabilities: status?.capabilities || {},
  });
}

function summarizeToolOutput(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, redactingReplacer);
  return text.length > 4000 ? `${text.slice(0, 4000)}...` : text;
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
  if (AIMessage.isInstance(message) && typeof message.text === 'string') return [{ type: 'text', text: message.text }];
  return [];
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): any {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function firstString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = value?.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned) return cleaned;
  }
  return undefined;
}

function firstStringArray(value: string | undefined): string[] | undefined {
  const parsed = value?.split(',').map((item) => item.trim()).filter(Boolean);
  return parsed?.length ? parsed : undefined;
}

function readFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readPositiveInteger(key: string): number | undefined {
  const parsed = Number.parseInt(process.env[key] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeNativeMcpToken(value: string | undefined): string | undefined {
  return value?.replace(/^Bearer\s+/i, '').trim() || undefined;
}

function normalizeSdkReferenceSection(value: string | undefined): NativeMcpLiveConfig['sdkReferenceSection'] {
  const allowed = new Set(['patterns', 'expressions', 'functions', 'rules', 'import', 'guidelines', 'design', 'all']);
  return allowed.has(value || '') ? value as NativeMcpLiveConfig['sdkReferenceSection'] : 'patterns';
}

function redactingReplacer(key: string, value: unknown): unknown {
  if (/key|token|secret|password|authorization|credential/i.test(key)) return '[redacted]';
  return value;
}

function redactSensitiveText(value: string, token: string): string {
  return value
    .replaceAll(token, '<redacted>')
    .replace(/(token|access_token|key|api_key)=([^&\s]+)/gi, '$1=redacted')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>');
}

function diagnostics(routingCase: RoutingCase, result: AgentRoutingResult): string {
  return JSON.stringify({
    provider: result.provider,
    model: result.model,
    case: routingCase.name,
    expectedTool: routingCase.expectedTool,
    forbiddenTools: routingCase.forbiddenTools,
    toolCalls: result.toolCalls,
    finalText: result.finalText.slice(0, 500),
  }, redactingReplacer, 2);
}
