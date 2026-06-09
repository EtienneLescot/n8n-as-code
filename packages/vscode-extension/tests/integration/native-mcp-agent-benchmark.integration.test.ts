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
import { tool, type StructuredToolInterface } from '@langchain/core/tools';
import { shouldDisableModelStreamingForToolCalling } from '../../src/services/agent-provider-capabilities.js';
import { N8nAsCodeMcpService } from '../../../mcp/src/services/mcp-service.js';
import { NATIVE_MCP_READ_ONLY_TOOL_MAP } from '../../../mcp/src/services/native-mcp-tools.js';

type ProviderId = 'openai' | 'mistral' | 'anthropic' | 'google' | 'openrouter' | 'openai-compatible';
type BenchmarkMode = 'mcp-off' | 'mcp-on';

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
}

interface BenchmarkScenario {
  id: string;
  title: string;
  prompt: string;
  expectedNodeTypes: string[];
  expectedTerms: string[];
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface WorkflowEvaluation {
  score: number;
  maxScore: number;
  issues: string[];
  fileExists: boolean;
  bytes: number;
  expectedNodeTypesFound: string[];
  expectedTermsFound: string[];
}

interface BenchmarkRunResult {
  provider: ProviderId;
  model: string;
  scenarioId: string;
  scenarioTitle: string;
  mode: BenchmarkMode;
  runIndex: number;
  elapsedMs: number;
  turns: number;
  toolCalls: Array<{ name: string; argsSummary: string }>;
  toolCallCounts: Record<string, number>;
  tokenUsage: TokenUsage;
  evaluation: WorkflowEvaluation;
  finalText: string;
  workflowExcerpt: string;
}

interface BenchmarkReport {
  generatedAt: string;
  providers: Array<{ id: ProviderId; model: string }>;
  config: {
    runs: number;
    modes: BenchmarkMode[];
    scenarios: string[];
    outputPath: string;
  };
  results: BenchmarkRunResult[];
  comparisons: Array<{
    provider: ProviderId;
    model: string;
    scenarioId: string;
    runIndex: number;
    elapsedDeltaMs?: number;
    tokenDelta?: TokenUsage;
    scoreDelta?: number;
    mcpOff?: Pick<BenchmarkRunResult, 'elapsedMs' | 'tokenUsage' | 'evaluation' | 'toolCallCounts'>;
    mcpOn?: Pick<BenchmarkRunResult, 'elapsedMs' | 'tokenUsage' | 'evaluation' | 'toolCallCounts'>;
  }>;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env.test'), quiet: true });

const providerCases: ProviderCase[] = [
  {
    id: 'openai',
    envKeys: ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_OPENAI_MODEL || process.env.N8N_AGENT_TEST_OPENAI_MODEL || 'gpt-4o-mini',
    createModel: ({ apiKey, model }) => new ChatOpenAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'mistral',
    envKeys: ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY', 'MISTRAL_KEY'],
    model: process.env.MISTRAL_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_MISTRAL_MODEL || process.env.N8N_AGENT_TEST_MISTRAL_MODEL || 'mistral-large-latest',
    createModel: ({ apiKey, model }) => new ChatMistralAI({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'anthropic',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'ANTHROPIC_KEY', 'CLAUDE_API_KEY'],
    model: process.env.ANTHROPIC_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_ANTHROPIC_MODEL || process.env.N8N_AGENT_TEST_ANTHROPIC_MODEL || 'claude-haiku-4-5',
    createModel: ({ apiKey, model }) => new ChatAnthropic({ apiKey, model, temperature: 0 }),
  },
  {
    id: 'google',
    envKeys: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_LLM_API_KEY', 'GOOGLE_LLM_API_KEY'],
    model: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_GEMINI_MODEL || process.env.N8N_AGENT_TEST_GEMINI_MODEL || 'gemini-3-flash-preview',
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
    model: process.env.OPENROUTER_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_OPENROUTER_MODEL || process.env.N8N_AGENT_TEST_OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
  {
    id: 'openai-compatible',
    envKeys: ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'],
    model: process.env.OPENAI_COMPATIBLE_MODEL || process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_OPENAI_COMPATIBLE_MODEL || process.env.N8N_AGENT_TEST_OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    createModel: ({ apiKey, model, baseUrl }) => new ChatOpenAI({ apiKey, model, temperature: 0, configuration: { baseURL: baseUrl } }),
  },
];

const benchmarkScenarios: BenchmarkScenario[] = [
  {
    id: 'form-trigger-http-enrichment',
    title: 'Create a form-triggered workflow with HTTP enrichment and Code normalization',
    expectedNodeTypes: ['n8n-nodes-base.formTrigger', 'n8n-nodes-base.httpRequest', 'n8n-nodes-base.code'],
    expectedTerms: ['@workflow', '@node', '@links', 'Form Trigger', 'HTTP Request', 'Code'],
    prompt: [
      'Create a maintainable n8n-as-code TypeScript workflow and write it to workflow.ts using write_workflow_file.',
      'The workflow must collect a search query from a Form Trigger, call an HTTP Request against https://example.com/search, and normalize the response in a Code node.',
      'Use @workflow, @node, and @links from @n8n-as-code/transformer. Do not use raw JSON workflow objects or invented helpers.',
      'Before choosing node type names or versions, use available knowledge tools. If native MCP is available, use it when it can improve live node type accuracy.',
      'After writing the file, validate the local workflow source if a local validation tool is available, then provide a concise summary.',
    ].join('\n'),
  },
  {
    id: 'repair-invalid-local-workflow',
    title: 'Repair invalid local code-first workflow source',
    expectedNodeTypes: ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.set'],
    expectedTerms: ['@workflow', '@node', '@links', 'Manual Trigger'],
    prompt: [
      'Repair the following invalid local n8n-as-code workflow source and write the corrected full file to workflow.ts using write_workflow_file.',
      'This is code-first local authoring. Do not use native live n8n MCP unless the available routing policy explicitly says it is needed for local authoring.',
      'The repaired workflow should have a Manual Trigger followed by a Set/Edit Fields node that outputs a greeting field.',
      'Invalid source:',
      '```ts',
      "const workflow = createWorkflow('Broken');",
      "workflow.addNode({ type: 'n8n-nodes-base.manualtrigger', name: 'manual trigger', version: 99 });",
      "workflow.addNode({ type: 'n8n-nodes-base.set', name: 'Set Greeting', parameters: { values: { greeting: 'hello' } } });",
      '```',
      'Use decorator-based n8n-as-code TypeScript only. After writing, validate locally if a local validation tool is available.',
    ].join('\n'),
  },
  {
    id: 'native-sdk-informed-workflow',
    title: 'Create a workflow after consulting native SDK/reference patterns',
    expectedNodeTypes: ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.code'],
    expectedTerms: ['@workflow', '@node', '@links', 'Manual Trigger', 'Code'],
    prompt: [
      'Create a small n8n-as-code TypeScript workflow and write it to workflow.ts using write_workflow_file.',
      'The workflow should use a Manual Trigger and a Code node to transform an input item into a structured audit object.',
      'Use @workflow, @node, and @links from @n8n-as-code/transformer. Keep the file concise and valid.',
      'If native MCP is available, consult the native workflow-builder SDK/reference patterns before authoring and use any relevant guidance. If native MCP is not available, proceed with local n8n-as-code knowledge.',
      'After writing the file, validate the local workflow source if a local validation tool is available.',
    ].join('\n'),
  },
];

test('native MCP agent benchmark compares LLM runs with MCP disabled and enabled', {
  skip: process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK !== '1',
  timeout: readPositiveInteger('N8N_NATIVE_MCP_AGENT_BENCHMARK_TIMEOUT_MS') || 900_000,
}, async (t) => {
  const nativeConfig = readNativeMcpLiveConfig();
  if (!nativeConfig) {
    t.skip('Missing NATIVE_MCP_URL and NATIVE_MCP_KEY in .env.test');
    return;
  }

  const requestedProviders = new Set((process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_PROVIDERS || process.env.N8N_AGENT_TEST_PROVIDERS || 'mistral')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean));
  const requestedModes = readModes();
  const requestedScenarios = readScenarioIds();
  const runs = readPositiveInteger('N8N_NATIVE_MCP_AGENT_BENCHMARK_RUNS') || 1;
  const outputPath = path.resolve(repoRoot, process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_OUTPUT || 'test-results/native-mcp-agent-benchmark.json');
  const selectedProviders = providerCases.filter((provider) => requestedProviders.has(provider.id));
  const runnableProviders = selectedProviders
    .map((provider) => ({ provider, apiKey: readFirstEnv(provider.envKeys) }))
    .filter((entry) => Boolean(entry.apiKey));
  const selectedScenarios = benchmarkScenarios.filter((scenario) => requestedScenarios.has(scenario.id));

  if (!runnableProviders.length) {
    t.skip(`Missing LLM provider credentials for selected benchmark providers: ${[...requestedProviders].join(',') || 'none'}`);
    return;
  }
  assert.ok(selectedScenarios.length > 0, `No benchmark scenarios selected from: ${[...requestedScenarios].join(',')}`);

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

  const results: BenchmarkRunResult[] = [];
  for (const entry of runnableProviders) {
    for (const scenario of selectedScenarios) {
      for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
        for (const mode of requestedModes) {
          const result = await runBenchmarkCase({
            provider: entry.provider,
            apiKey: entry.apiKey as string,
            mode,
            scenario,
            runIndex,
            service,
            nativeConfig,
          });
          results.push(result);
          console.log(formatBenchmarkSummary(result));
        }
      }
    }
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    providers: runnableProviders.map((entry) => ({ id: entry.provider.id, model: entry.provider.model })),
    config: {
      runs,
      modes: requestedModes,
      scenarios: selectedScenarios.map((scenario) => scenario.id),
      outputPath,
    },
    results,
    comparisons: buildComparisons(results),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, redactingReplacer, 2), 'utf8');
  assert.ok(results.length > 0, 'Benchmark produced no results');
  assert.ok(fs.existsSync(outputPath), `Benchmark report was not written to ${outputPath}`);
  console.log(`[native-mcp-agent-benchmark] report=${outputPath} results=${results.length}`);
});

async function runBenchmarkCase(input: {
  provider: ProviderCase;
  apiKey: string;
  mode: BenchmarkMode;
  scenario: BenchmarkScenario;
  runIndex: number;
  service: N8nAsCodeMcpService;
  nativeConfig: NativeMcpLiveConfig;
}): Promise<BenchmarkRunResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `n8nac-native-benchmark-${input.provider.id}-${input.mode}-`));
  const workflowPath = path.join(tempDir, 'workflow.ts');
  const startedAt = Date.now();
  const usage: TokenUsage = { input: 0, output: 0, total: 0 };
  const toolCalls: Array<{ name: string; argsSummary: string }> = [];
  let turns = 0;
  let finalText = '';

  try {
    const tools = createBenchmarkTools(input.mode, input.service, input.nativeConfig, workflowPath, input.scenario, toolCalls);
    const model = input.provider.createModel({ apiKey: input.apiKey, model: input.provider.model, baseUrl: input.provider.baseUrl });
    assert.equal(typeof model.bindTools, 'function', `${input.provider.id} model does not support bindTools`);
    const boundModel = model.bindTools(tools);
    const toolByName = new Map(tools.map((item) => [item.name, item]));
    const messages: any[] = [new SystemMessage(buildBenchmarkSystemPrompt(input.mode)), new HumanMessage(input.scenario.prompt)];

    for (let step = 0; step < 8; step += 1) {
      const response = await boundModel.invoke(messages);
      turns += 1;
      addUsage(usage, usageFromAIMessage(response));
      const calls = extractToolCalls(response);
      messages.push(response);
      if (!calls.length) {
        finalText = extractTextContent(response);
        break;
      }
      for (const call of calls) {
        const selectedTool = toolByName.get(call.name);
        assert.ok(selectedTool, `${input.provider.id}/${input.mode}/${input.scenario.id} selected unknown tool ${call.name}`);
        const output = await selectedTool.invoke(call.args || {});
        messages.push(new ToolMessage({
          name: call.name,
          tool_call_id: call.id || `${call.name}-${step}`,
          content: summarizeToolOutput(output),
        }));
      }
    }

    const workflowContent = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
    const evaluation = evaluateWorkflow(input.scenario, workflowContent);
    return {
      provider: input.provider.id,
      model: input.provider.model,
      scenarioId: input.scenario.id,
      scenarioTitle: input.scenario.title,
      mode: input.mode,
      runIndex: input.runIndex,
      elapsedMs: Date.now() - startedAt,
      turns,
      toolCalls,
      toolCallCounts: countToolCalls(toolCalls),
      tokenUsage: usage,
      evaluation,
      finalText: finalText.slice(0, 2000),
      workflowExcerpt: workflowContent.slice(0, 4000),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createBenchmarkTools(
  mode: BenchmarkMode,
  service: N8nAsCodeMcpService,
  nativeConfig: NativeMcpLiveConfig,
  workflowPath: string,
  scenario: BenchmarkScenario,
  toolCalls: Array<{ name: string; argsSummary: string }>,
): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [
    tool(async (input: any) => {
      const content = String(input?.content || '');
      fs.writeFileSync(workflowPath, content, 'utf8');
      return JSON.stringify({ ok: true, path: 'workflow.ts', bytes: Buffer.byteLength(content, 'utf8') });
    }, {
      name: 'write_workflow_file',
      description: 'Write the complete local n8n-as-code TypeScript workflow source to workflow.ts. Use this to produce the benchmark workflow artifact.',
      schema: objectSchema({ content: { type: 'string', description: 'Complete workflow.ts TypeScript source.' } }, ['content']),
    }),
    tool(async () => {
      const content = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
      return JSON.stringify({ exists: Boolean(content), content: content.slice(0, 5000) });
    }, {
      name: 'read_workflow_file',
      description: 'Read the workflow.ts file that has been written during this benchmark run.',
      schema: objectSchema({}),
    }),
    tool(async (input: any) => {
      const content = String(input?.workflowContent || (fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : ''));
      return JSON.stringify(evaluateWorkflow(scenario, content));
    }, {
      name: 'validate_n8n_workflow',
      description: 'Validate local n8n-as-code workflow source for benchmark scoring. Use for local code-first authoring validation.',
      schema: objectSchema({ workflowContent: { type: 'string', description: 'Optional workflow source to validate.' } }),
    }),
    tool(async (input: any) => JSON.stringify(localKnowledgeResponse(String(input?.query || ''), scenario)), {
      name: 'search_n8n_knowledge',
      description: 'Search local bundled n8n-as-code knowledge. Use this in both modes for local code-first workflow authoring and common node guidance.',
      schema: objectSchema({ query: { type: 'string', description: 'Local knowledge search query.' } }, ['query']),
    }),
  ];

  if (mode === 'mcp-on') {
    tools.push(
      tool(async (input: any) => summarizeNativeStatus(await service.getNativeMcpStatus({ includeTools: input?.includeTools !== false })), {
        name: 'get_n8n_native_mcp_status',
        description: 'Check native n8n MCP availability and live tool capabilities. Use before native MCP tools.',
        schema: objectSchema({ includeTools: { type: 'boolean', description: 'Include live native tool discovery.' } }),
      }),
      tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.searchNativeNodes, {
        queries: Array.isArray(input?.queries) && input.queries.length ? input.queries : nodeQueriesFromScenario(scenario),
      })), {
        name: 'search_n8n_native_nodes',
        description: 'Search live native n8n node definitions through native MCP. Use to improve node type, version, and parameter accuracy before authoring.',
        schema: objectSchema({ queries: { type: 'array', items: { type: 'string' }, description: 'Node search queries.' } }),
      }),
      tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.getNativeSdkReference, {
        section: input?.section || 'patterns',
      })), {
        name: 'get_n8n_native_sdk_reference',
        description: 'Read native n8n workflow-builder SDK/reference patterns through native MCP. Use when workflow structure or native patterns may improve authoring.',
        schema: objectSchema({ section: { type: 'string', enum: ['patterns', 'expressions', 'functions', 'rules', 'import', 'guidelines', 'design', 'all'] } }),
      }),
      tool(async (input: any) => summarizeToolOutput(await service.callNativeMcpTool(NATIVE_MCP_READ_ONLY_TOOL_MAP.searchLiveWorkflows, {
        query: input?.query,
        limit: input?.limit || 5,
      })), {
        name: 'search_n8n_live_workflows',
        description: 'Search live workflows in the connected n8n instance. Use only if examples from the live instance are directly useful.',
        schema: objectSchema({ query: { type: 'string' }, limit: { type: 'number' } }),
      }),
    );
  }

  return tools.map((item) => wrapToolForMetrics(item, toolCalls));
}

function wrapToolForMetrics(toolInstance: StructuredToolInterface, toolCalls: Array<{ name: string; argsSummary: string }>): StructuredToolInterface {
  const originalInvoke = toolInstance.invoke.bind(toolInstance);
  (toolInstance as any).invoke = async (input: unknown, config?: unknown) => {
    toolCalls.push({ name: toolInstance.name, argsSummary: summarizeArgs(input) });
    return originalInvoke(input as any, config as any);
  };
  return toolInstance;
}

function buildBenchmarkSystemPrompt(mode: BenchmarkMode): string {
  return [
    'You are an n8n-as-code workflow authoring benchmark agent.',
    'Always write the final workflow source using write_workflow_file. Prefer concise, valid TypeScript.',
    'Use @workflow, @node, and @links from @n8n-as-code/transformer. Do not emit raw n8n JSON workflow objects.',
    'Never hardcode secrets, credential IDs, API keys, passwords, or bearer tokens.',
    'Use local n8n-as-code tools for code-first workflow authoring and validation.',
    mode === 'mcp-on'
      ? 'Native n8n MCP tools are available. Before using live native node definitions or SDK reference, call get_n8n_native_mcp_status. Use native MCP when it can improve node type/version/parameter accuracy or workflow-builder pattern accuracy.'
      : 'Native n8n MCP tools are not available in this run. Do not ask for them and do not mention needing them; solve the task with local n8n-as-code knowledge only.',
  ].join('\n');
}

function evaluateWorkflow(scenario: BenchmarkScenario, content: string): WorkflowEvaluation {
  const issues: string[] = [];
  let score = 0;
  const maxScore = 12 + scenario.expectedNodeTypes.length + scenario.expectedTerms.length;
  const fileExists = content.trim().length > 0;
  if (fileExists) score += 2; else issues.push('workflow file was not written');
  if (hasNamedTransformerImports(content, ['workflow', 'node', 'links'])) score += 2; else issues.push('missing transformer workflow/node/links import');
  if (/@workflow\s*\(/.test(content)) score += 2; else issues.push('missing @workflow decorator');
  if (/@node\s*\(/.test(content)) score += 2; else issues.push('missing @node decorator');
  if (/@links\s*\(/.test(content)) score += 1; else issues.push('missing @links decorator');
  if (!/createWorkflow|defineWorkflow|workflowJson|"nodes"\s*:/.test(content)) score += 1; else issues.push('contains raw workflow JSON or invented helper API');
  if (!/api[_-]?key|bearer\s+[a-z0-9._-]+|credentialId\s*:\s*['"][^'"]+/i.test(content)) score += 2; else issues.push('potential hardcoded secret or credential ID');

  const expectedNodeTypesFound = scenario.expectedNodeTypes.filter((nodeType) => content.includes(nodeType));
  score += expectedNodeTypesFound.length;
  for (const missing of scenario.expectedNodeTypes.filter((nodeType) => !expectedNodeTypesFound.includes(nodeType))) {
    issues.push(`missing expected node type ${missing}`);
  }

  const expectedTermsFound = scenario.expectedTerms.filter((term) => content.toLowerCase().includes(term.toLowerCase()));
  score += expectedTermsFound.length;
  for (const missing of scenario.expectedTerms.filter((term) => !expectedTermsFound.includes(term))) {
    issues.push(`missing expected term ${missing}`);
  }

  return {
    score,
    maxScore,
    issues,
    fileExists,
    bytes: Buffer.byteLength(content, 'utf8'),
    expectedNodeTypesFound,
    expectedTermsFound,
  };
}

function localKnowledgeResponse(query: string, scenario: BenchmarkScenario): Record<string, unknown> {
  return {
    query,
    source: 'local-n8n-as-code-knowledge',
    guidance: [
      'Use decorator-based TypeScript with @workflow, @node, and @links.',
      'Common node type names include n8n-nodes-base.manualTrigger, n8n-nodes-base.formTrigger, n8n-nodes-base.httpRequest, n8n-nodes-base.code, and n8n-nodes-base.set.',
      'Do not hardcode credentials or secrets. Leave credential binding to environment configuration.',
      `Scenario expects these node types when relevant: ${scenario.expectedNodeTypes.join(', ')}.`,
    ],
  };
}

function nodeQueriesFromScenario(scenario: BenchmarkScenario): string[] {
  return scenario.expectedNodeTypes.map((nodeType) => nodeType.replace(/^n8n-nodes-base\./, '').replace(/([A-Z])/g, ' $1').trim()).filter(Boolean);
}

function readNativeMcpLiveConfig(): NativeMcpLiveConfig | undefined {
  const endpoint = firstString(process.env.NATIVE_MCP_URL);
  const token = normalizeNativeMcpToken(firstString(process.env.NATIVE_MCP_KEY));
  if (!endpoint || !token) return undefined;
  return {
    endpoint,
    token,
    timeoutMs: readPositiveInteger('NATIVE_MCP_TIMEOUT_MS') || 30_000,
  };
}

function readModes(): BenchmarkMode[] {
  const requested = (process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_MODES || 'mcp-off,mcp-on')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const modes = requested.filter((value): value is BenchmarkMode => value === 'mcp-off' || value === 'mcp-on');
  return modes.length ? modes : ['mcp-off', 'mcp-on'];
}

function readScenarioIds(): Set<string> {
  const raw = process.env.N8N_NATIVE_MCP_AGENT_BENCHMARK_SCENARIOS;
  const selected = raw?.split(',').map((value) => value.trim()).filter(Boolean);
  return new Set(selected?.length ? selected : benchmarkScenarios.map((scenario) => scenario.id));
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

function usageFromAIMessage(message: any): TokenUsage | undefined {
  const usage = message?.usage_metadata || message?.response_metadata?.usage || message?.response_metadata?.tokenUsage || message?.additional_kwargs?.usage;
  if (!usage) return undefined;
  const input = numberOrZero(usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens);
  const output = numberOrZero(usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens);
  const total = numberOrZero(usage.total_tokens ?? usage.totalTokens ?? usage.total_tokens) || input + output;
  if (!input && !output && !total) return undefined;
  return { input, output, total };
}

function addUsage(target: TokenUsage, usage: TokenUsage | undefined): void {
  if (!usage) return;
  target.input += usage.input;
  target.output += usage.output;
  target.total += usage.total;
}

function countToolCalls(toolCalls: Array<{ name: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const call of toolCalls) counts[call.name] = (counts[call.name] || 0) + 1;
  return counts;
}

function buildComparisons(results: BenchmarkRunResult[]): BenchmarkReport['comparisons'] {
  const comparisons: BenchmarkReport['comparisons'] = [];
  const keys = new Set(results.map((result) => `${result.provider}\t${result.model}\t${result.scenarioId}\t${result.runIndex}`));
  for (const key of keys) {
    const [provider, model, scenarioId, rawRunIndex] = key.split('\t') as [ProviderId, string, string, string];
    const runIndex = Number.parseInt(rawRunIndex, 10);
    const off = results.find((result) => result.provider === provider && result.model === model && result.scenarioId === scenarioId && result.runIndex === runIndex && result.mode === 'mcp-off');
    const on = results.find((result) => result.provider === provider && result.model === model && result.scenarioId === scenarioId && result.runIndex === runIndex && result.mode === 'mcp-on');
    comparisons.push({
      provider,
      model,
      scenarioId,
      runIndex,
      elapsedDeltaMs: off && on ? on.elapsedMs - off.elapsedMs : undefined,
      tokenDelta: off && on ? {
        input: on.tokenUsage.input - off.tokenUsage.input,
        output: on.tokenUsage.output - off.tokenUsage.output,
        total: on.tokenUsage.total - off.tokenUsage.total,
      } : undefined,
      scoreDelta: off && on ? on.evaluation.score - off.evaluation.score : undefined,
      mcpOff: off ? pickComparable(off) : undefined,
      mcpOn: on ? pickComparable(on) : undefined,
    });
  }
  return comparisons;
}

function pickComparable(result: BenchmarkRunResult): Pick<BenchmarkRunResult, 'elapsedMs' | 'tokenUsage' | 'evaluation' | 'toolCallCounts'> {
  return {
    elapsedMs: result.elapsedMs,
    tokenUsage: result.tokenUsage,
    evaluation: result.evaluation,
    toolCallCounts: result.toolCallCounts,
  };
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
  return text.length > 6000 ? `${text.slice(0, 6000)}...` : text;
}

function summarizeArgs(value: unknown): string {
  const text = JSON.stringify(value, redactingReplacer) || '';
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
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

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const cleaned = value?.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned) return cleaned;
  }
  return undefined;
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

function redactingReplacer(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase();
  if (['key', 'apikey', 'api_key', 'token', 'secret', 'password', 'authorization', 'credentialid', 'credential_id'].includes(normalized)) return '[redacted]';
  if (normalized.includes('secret') || normalized.includes('password') || normalized.includes('authorization')) return '[redacted]';
  return value;
}

function hasNamedTransformerImports(content: string, names: string[]): boolean {
  const imported = new Set<string>();
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@n8n-as-code\/transformer['"]/g;
  for (const match of content.matchAll(importRegex)) {
    for (const rawName of match[1].split(',')) {
      const name = rawName.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name) imported.add(name);
    }
  }
  return names.every((name) => imported.has(name));
}

function redactSensitiveText(value: string, token: string): string {
  return value
    .replaceAll(token, '<redacted>')
    .replace(/(token|access_token|key|api_key)=([^&\s]+)/gi, '$1=redacted')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer <redacted>');
}

function formatBenchmarkSummary(result: BenchmarkRunResult): string {
  return [
    '[native-mcp-agent-benchmark]',
    `provider=${result.provider}`,
    `model=${result.model}`,
    `scenario=${result.scenarioId}`,
    `mode=${result.mode}`,
    `run=${result.runIndex}`,
    `elapsedMs=${result.elapsedMs}`,
    `turns=${result.turns}`,
    `tokens=${result.tokenUsage.total}`,
    `score=${result.evaluation.score}/${result.evaluation.maxScore}`,
    `tools=${result.toolCalls.map((call) => call.name).join('|') || 'none'}`,
    `issues=${result.evaluation.issues.slice(0, 3).map((issue) => JSON.stringify(issue)).join('|') || 'none'}`,
  ].join(' ');
}
