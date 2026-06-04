import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import { AgentRuntimeController, getAgentProviderSecretKey, type AgentWorkbenchMessage } from '../../src/services/agent-runtime-controller.js';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env.test'), quiet: true });

const TARGET_WORKFLOW = 'workflows/dev/recherche-annonces-multi-plateformes.workflow.ts';
const EXACT_AUTHORING_PROMPT = `Crée un workflow TypeScript n8n-as-code similaire à \`recherche-annonces-leboncoin\`: un moteur interactif de recherche d’annonces pertinentes multi-plateformes.

Objectif:
Permettre à un utilisateur de décrire librement une recherche d’annonce, puis:
1. transformer la demande en critères structurés;
2. générer plusieurs requêtes de recherche multi-plateformes;
3. récupérer des résultats via Leboncoin, Bing RSS ou sources équivalentes;
4. extraire et dédupliquer des annonces candidates;
5. faire sélectionner et scorer les meilleures annonces par un LLM;
6. afficher une page HTML de résultats;
7. permettre à l’utilisateur d’ajouter des ajustements et de relancer la recherche.

Contraintes:
- Utilise \`@n8n-as-code/transformer\` avec \`@workflow\`, \`@node\` et \`@links\`.
- Ajoute un bloc \`<workflow-map>\` en haut du fichier.
- Vérifie les schémas n8n réels avant de choisir les types, versions et paramètres de nœuds.
- Ne hardcode aucun secret ni credential ID.
- Les sous-nœuds AI doivent être connectés avec \`.uses()\`.
- Les sorties LLM importantes doivent passer par des parsers structurés.
- Le workflow doit être lisible, validable et maintenable.

Architecture attendue:
- Un \`Form Trigger\` demandant:
  - critères libres de recherche;
  - nombre maximum de résultats.
- Un agent LLM d’extraction qui convertit la demande en critères:
  - requête principale;
  - localisation;
  - prix min/max;
  - mots obligatoires;
  - mots exclus;
  - critères qualitatifs;
  - plateformes cibles;
  - requêtes d’exploration;
  - nombre de résultats max.
- Un nœud Code qui construit plusieurs recherches:
  - requête large;
  - synonymes;
  - variantes de mots-clés;
  - plateformes comme Leboncoin, eBay, ParuVendu ou autres selon le contexte;
  - URLs Bing RSS ou URLs lisibles via Jina Reader pour Leboncoin.
- Une boucle qui exécute les recherches HTTP.
- Une agrégation des réponses.
- Un nœud Code qui extrait des annonces candidates:
  - titre;
  - prix;
  - localisation;
  - catégorie;
  - URL;
  - plateforme;
  - extrait;
  - score de tri préliminaire.
- Un agent LLM de sélection qui évalue uniquement les annonces candidates, sans inventer de nouvelles annonces.
- Un outil HTTP optionnel de recherche Bing RSS utilisable par l’agent au maximum une fois pour clarifier un point important.
- Un nœud Code qui génère une page HTML responsive avec:
  - critères interprétés;
  - synthèse;
  - résultats scorés;
  - raisons de sélection;
  - points d’attention;
  - liens vers les annonces.
- Un formulaire de “steering” permettant:
  - de terminer;
  - ou de relancer avec des ajustements.
- Un agent LLM qui fusionne les critères actuels avec les ajustements utilisateur, puis reboucle sur la construction des recherches.

Critères d’acceptation:
- Recherche itérative fonctionnelle.
- Résultats affichés dans une page HTML claire.
- Parsers structurés pour les critères et les annonces sélectionnées.
- Gestion des résultats pauvres, bloqués ou incomplets.
- Pas d’annonces inventées par le LLM.
- Pas de secrets hardcodés.`;

test('workbench runtime authoring continues past non-final progress text', { timeout: 120_000 }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workbench-runtime-'));
  const storageDir = path.join(tempDir, '.storage');
  const workspaceRoot = path.join(tempDir, 'workspace');
  const outputLines: string[] = [];
  const postedMessages: AgentWorkbenchMessage[] = [];
  const scriptedModel = new ScriptedWorkbenchModel(createScriptedResponses(TARGET_WORKFLOW));

  try {
    createWorkbenchWorkspace(workspaceRoot);
    const controller = new AgentRuntimeController(createExtensionContext(storageDir), {
      appendLine: (line: string) => outputLines.push(line),
    } as any);
    (controller as any).getProviderRuntimeConfig = async () => ({
      ready: true,
      provider: 'openai-compatible',
      model: 'scripted-workbench',
      temperature: 0,
    });
    (controller as any).createLangChainModel = async () => scriptedModel;
    (controller as any).resolveContextWindow = async () => 200_000;

    const result = await controller.sendPrompt({
      prompt: EXACT_AUTHORING_PROMPT,
      workspaceRoot,
    }, async (message) => {
      postedMessages.push(message);
      return true;
    });

    const workflowPath = path.join(workspaceRoot, TARGET_WORKFLOW);
    const workflowContent = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
    const streamEvents = postedMessages.filter((message): message is Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }> => message.type === 'agent.streamEvent').map((message) => message.event);
    const operationEvents = streamEvents.filter((event) => event.type === 'operation');
    const toolLabels = operationEvents.map((event) => `${event.label}:${event.status}`);
    const toolEvents = operationEvents.map((event) => `${event.operationId.split(':')[0]}:${event.status}:${event.category}`);
    const finalIndex = streamEvents.findIndex((event) => event.type === 'final');
    const writeDoneIndex = streamEvents.findIndex((event) => event.type === 'operation' && event.label === 'Write File' && event.status === 'done');
    const diagnostics = () => JSON.stringify({
      result,
      toolLabels,
      toolEvents,
      finalIndex,
      writeDoneIndex,
      modelCalls: scriptedModel.callLog,
      outputLines,
      lastMessage: postedMessages[postedMessages.length - 1],
    }, null, 2);

    assert.equal(postedMessages.some((message) => message.type === 'agent.error'), false, diagnostics());
    assert.ok(toolLabels.includes('Write Todos:done'), diagnostics());
    assert.ok(toolLabels.includes('Read File:done'), diagnostics());
    assert.ok(operationEvents.filter((event) => event.label === 'Tool' && event.status === 'done').length >= 2, diagnostics());
    assert.ok(scriptedModel.callLog.some((entry) => entry.includes('workflows/dev/recherche-annonces-leboncoin.workflow.ts')), diagnostics());
    assert.ok(toolLabels.includes('Execute:done'), diagnostics());
    assert.ok(writeDoneIndex >= 0, diagnostics());
    assert.ok(finalIndex > writeDoneIndex, diagnostics());
    assert.ok(fs.existsSync(workflowPath), diagnostics());
    assert.equal(result.workflowChanged, true, diagnostics());
    assert.match(workflowContent, /<workflow-map>/, diagnostics());
    assert.match(workflowContent, /@workflow\s*\(/, diagnostics());
    assert.match(workflowContent, /@node\s*\(/, diagnostics());
    assert.match(workflowContent, /@links\s*\(/, diagnostics());
    assert.match(workflowContent, /Form Trigger/, diagnostics());
    assert.match(workflowContent, /structured parser|parser structuré|Structured Output Parser/i, diagnostics());
    assert.ok(scriptedModel.callLog.some((entry) => entry.includes('N8N_NON_FINAL_ASSISTANT_PHASE_RECOVERY')), diagnostics());
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('workbench runtime live authoring prompt', {
  skip: process.env.N8N_AGENT_WORKBENCH_LIVE_PROMPT !== '1',
  timeout: 600_000,
}, async (t) => {
  const provider = (process.env.N8N_AGENT_WORKBENCH_LIVE_PROVIDER || 'openai').trim();
  const apiKey = readFirstEnv(liveProviderEnvKeys(provider));
  if (!apiKey) {
    t.skip(`Missing API key for live provider ${provider}`);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workbench-live-'));
  const storageDir = path.join(tempDir, '.storage');
  const workspaceRoot = path.join(tempDir, 'workspace');
  const outputLines: string[] = [];
  const postedMessages: AgentWorkbenchMessage[] = [];
  try {
    createWorkbenchWorkspace(workspaceRoot);
    const context = createExtensionContext(storageDir, {
      globalState: {
        'n8n.agent.settingsManaged': true,
        'n8n.agent.provider': provider,
        'n8n.agent.model': process.env.N8N_AGENT_WORKBENCH_LIVE_MODEL || undefined,
        'n8n.agent.baseUrl': process.env.N8N_AGENT_WORKBENCH_LIVE_BASE_URL || undefined,
      },
      secrets: {
        [getAgentProviderSecretKey(provider)]: apiKey,
      },
    });
    const controller = new AgentRuntimeController(context, {
      appendLine: (line: string) => outputLines.push(line),
    } as any);

    const result = await controller.sendPrompt({ prompt: EXACT_AUTHORING_PROMPT, workspaceRoot }, async (message) => {
      postedMessages.push(message);
      return true;
    });
    const workflowPath = path.join(workspaceRoot, TARGET_WORKFLOW);
    assert.equal(postedMessages.some((message) => message.type === 'agent.error'), false, liveDiagnostics(result, postedMessages, outputLines, workflowPath));
    assert.ok(fs.existsSync(workflowPath), liveDiagnostics(result, postedMessages, outputLines, workflowPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

class ScriptedWorkbenchModel extends BaseChatModel {
  private readonly responses: AIMessage[];
  readonly callLog: string[] = [];
  boundTools: string[] = [];

  constructor(responses: AIMessage[]) {
    super({});
    this.responses = [...responses];
  }

  _llmType(): string {
    return 'scripted-workbench';
  }

  bindTools(tools: Array<{ name?: string }>): this {
    this.boundTools = tools.map((tool) => String(tool.name || 'unknown'));
    return this;
  }

  async _generate(messages: BaseMessage[], _options: this['ParsedCallOptions'], _runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
    this.callLog.push(messages.map((message) => extractMessageText(message)).join('\n---\n').slice(-2500));
    const message = this.responses.shift() || new AIMessage({
      content: 'Scripted model exhausted before the workbench run completed.',
      additional_kwargs: { phase: 'final' },
      response_metadata: { phase: 'final' },
    });
    return {
      generations: [{ message, text: extractMessageText(message) }],
      llmOutput: {},
    };
  }
}

function createScriptedResponses(targetWorkflow: string): AIMessage[] {
  return [
    toolMessage('scripted-write-todos', 'write_todos', {
      todos: [
        { content: 'Charger les consignes n8n-as-code', status: 'completed' },
        { content: 'Inspecter le workflow de référence', status: 'in_progress' },
        { content: 'Vérifier les schémas n8n réels', status: 'pending' },
        { content: 'Créer et valider le workflow multi-plateformes', status: 'pending' },
      ],
    }),
    toolMessage('scripted-read-skill', 'read_file', { file_path: '.agents/skills/n8n-architect/SKILL.md', limit: 100 }),
    toolMessage('scripted-ls', 'ls', { path: '.' }),
    toolMessage('scripted-glob', 'glob', { pattern: 'workflows/**/*.workflow.ts', path: '.' }),
    new AIMessage({
      content: 'J’ai chargé les consignes n8n-as-code et identifié le workflow de référence. Je vais maintenant vérifier les schémas avant de générer le workflow demandé.',
    }),
    toolMessage('scripted-schema-form', 'execute', { command: 'node -e "console.log(\'n8n-nodes-base.formTrigger v2 schema ok\')"' }),
    toolMessage('scripted-schema-http', 'execute', { command: 'node -e "console.log(\'n8n-nodes-base.httpRequest v4.2 schema ok\')"' }),
    toolMessage('scripted-write-workflow', 'write_file', { file_path: targetWorkflow, content: workflowSource() }),
    toolMessage('scripted-validate', 'execute', { command: 'node -e "console.log(\'validation ok\')"' }),
    new AIMessage({
      content: `Le workflow TypeScript multi-plateformes a été créé et validé dans ${targetWorkflow}.`,
      additional_kwargs: { phase: 'final' },
      response_metadata: { phase: 'final' },
    }),
  ];
}

function toolMessage(id: string, name: string, args: Record<string, unknown>): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [{ id, name, args, type: 'tool_call' }],
  });
}

function workflowSource(): string {
  return `/*
<workflow-map>
Form Trigger -> Criteria Extraction Agent -> Structured Criteria Parser -> Build Searches Code -> HTTP Search Loop -> Aggregate Responses -> Extract Candidates Code -> Selection Agent -> Structured Selection Parser -> Results HTML Code -> Steering Form -> Merge Adjustments Agent -> Build Searches Code
</workflow-map>
*/
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Recherche Annonces Multi-Plateformes',
  active: false,
})
export class RechercheAnnoncesMultiPlateformesWorkflow {
  @node({
    name: 'Form Trigger',
    type: 'n8n-nodes-base.formTrigger',
    version: 2,
    parameters: {
      formTitle: 'Recherche interactive d’annonces',
      formFields: {
        values: [
          { fieldLabel: 'Critères libres de recherche', fieldType: 'textarea', requiredField: true },
          { fieldLabel: 'Nombre maximum de résultats', fieldType: 'number', requiredField: true },
        ],
      },
    },
  })
  FormTrigger = {};

  @node({ name: 'Extraction Criteria Agent', type: '@n8n/n8n-nodes-langchain.agent', version: 2, parameters: { promptType: 'define', text: 'Convertis la demande en critères structurés sans inventer de données.' } })
  ExtractionCriteriaAgent = {};

  @node({ name: 'Criteria Structured Output Parser', type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, parameters: { schemaType: 'manual', inputSchema: '{"type":"object","properties":{"query":{"type":"string"},"location":{"type":"string"},"priceMin":{"type":"number"},"priceMax":{"type":"number"},"requiredKeywords":{"type":"array","items":{"type":"string"}},"excludedKeywords":{"type":"array","items":{"type":"string"}},"qualityCriteria":{"type":"array","items":{"type":"string"}},"platforms":{"type":"array","items":{"type":"string"}},"explorationQueries":{"type":"array","items":{"type":"string"}},"maxResults":{"type":"number"}},"required":["query","platforms","explorationQueries","maxResults"]}' } })
  CriteriaParser = {};

  @node({ name: 'Build Multi Platform Searches', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'return [{ json: { platform: "Leboncoin", url: "https://r.jina.ai/http://www.bing.com/search?q=site:leboncoin.fr+annonce" } }, { json: { platform: "eBay", url: "https://www.bing.com/search?format=rss&q=site:ebay.fr+annonce" } }, { json: { platform: "ParuVendu", url: "https://www.bing.com/search?format=rss&q=site:paruvendu.fr+annonce" } }];' } })
  BuildSearches = {};

  @node({ name: 'HTTP Search Loop', type: 'n8n-nodes-base.httpRequest', version: 4.2, parameters: { method: 'GET', url: '={{$json.url}}', options: { timeout: 15000 } } })
  HttpSearchLoop = {};

  @node({ name: 'Aggregate Responses', type: 'n8n-nodes-base.aggregate', version: 1, parameters: { aggregate: 'aggregateAllItemData', destinationFieldName: 'responses' } })
  AggregateResponses = {};

  @node({ name: 'Extract Candidate Ads', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'const seen = new Set(); return ($json.responses || []).flatMap((response) => { const text = JSON.stringify(response); return [{ title: "Annonce candidate", price: null, location: null, category: null, url: response.url, platform: response.platform, excerpt: text.slice(0, 300), preliminaryScore: 0.5 }]; }).filter((ad) => ad.url && !seen.has(ad.url) && seen.add(ad.url)).map((ad) => ({ json: ad }));' } })
  ExtractCandidateAds = {};

  @node({ name: 'Selection Agent', type: '@n8n/n8n-nodes-langchain.agent', version: 2, parameters: { promptType: 'define', text: 'Évalue uniquement les annonces candidates fournies. N’invente jamais de nouvelles annonces.' } })
  SelectionAgent = {};

  @node({ name: 'Bing RSS Clarification Tool', type: '@n8n/n8n-nodes-langchain.toolHttpRequest', version: 1.1, parameters: { name: 'bing_rss_clarification_once', url: 'https://www.bing.com/search?format=rss&q={{$fromAI("query")}}' } })
  BingRssClarificationTool = {};

  @node({ name: 'Selection Structured Output Parser', type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, parameters: { schemaType: 'manual', inputSchema: '{"type":"object","properties":{"summary":{"type":"string"},"results":{"type":"array","items":{"type":"object","properties":{"title":{"type":"string"},"url":{"type":"string"},"score":{"type":"number"},"reasons":{"type":"array","items":{"type":"string"}},"warnings":{"type":"array","items":{"type":"string"}}},"required":["title","url","score","reasons"]}}},"required":["summary","results"]}' } })
  SelectionParser = {};

  @node({ name: 'Generate Responsive HTML Results', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'const results = $json.results || []; const cards = results.map((ad) => "<article><h2>" + ad.title + "</h2><p>Score: " + ad.score + "</p><a href=\"" + ad.url + "\">Voir l’annonce</a></article>").join(""); return [{ json: { html: "<!doctype html><html><body><main><h1>Résultats scorés</h1>" + cards + "<form><textarea name=\"adjustments\"></textarea><button>Relancer</button></form></main></body></html>" } } }];' } })
  GenerateHtmlResults = {};

  @node({ name: 'Steering Form', type: 'n8n-nodes-base.form', version: 1, parameters: { formTitle: 'Ajuster ou terminer', formFields: { values: [{ fieldLabel: 'Action', fieldType: 'dropdown', fieldOptions: { values: [{ option: 'Terminer' }, { option: 'Relancer avec ajustements' }] } }, { fieldLabel: 'Ajustements utilisateur', fieldType: 'textarea' }] } } })
  SteeringForm = {};

  @node({ name: 'Merge Adjustments Agent', type: '@n8n/n8n-nodes-langchain.agent', version: 2, parameters: { promptType: 'define', text: 'Fusionne les critères actuels avec les ajustements utilisateur puis renvoie des critères structurés.' } })
  MergeAdjustmentsAgent = {};

  @links()
  defineRouting() {
    this.ExtractionCriteriaAgent.uses(this.CriteriaParser);
    this.SelectionAgent.uses(this.BingRssClarificationTool);
    this.SelectionAgent.uses(this.SelectionParser);
    this.MergeAdjustmentsAgent.uses(this.CriteriaParser);
  }
}
`;
}

function createWorkbenchWorkspace(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, '.agents', 'skills', 'n8n-architect'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'AGENTS.md'), [
    '# n8n-as-code workspace',
    'Use n8n-as-code TypeScript workflows with @workflow, @node, and @links.',
    'Before workflow commands, run n8nac workspace migrate --json then workspace status --json.',
  ].join('\n'));
  fs.writeFileSync(path.join(rootDir, '.agents', 'skills', 'n8n-architect', 'SKILL.md'), [
    '# n8n Architect',
    'Create maintainable n8n-as-code workflows and verify node schemas before choosing versions.',
    'Connect LangChain sub-nodes with .uses() and use structured parsers for important LLM outputs.',
  ].join('\n'));
  fs.writeFileSync(path.join(rootDir, 'workflows', 'dev', 'recherche-annonces-leboncoin.workflow.ts'), `import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ name: 'Recherche Annonces Leboncoin', active: false })
export class RechercheAnnoncesLeboncoinWorkflow {
  @node({ name: 'Form Trigger', type: 'n8n-nodes-base.formTrigger', version: 2 })
  FormTrigger = {};

  @links()
  defineRouting() {}
}
`);
  fs.writeFileSync(path.join(rootDir, 'n8nac-config.json'), JSON.stringify({ version: 1, environments: {} }, null, 2));
}

function createExtensionContext(storageDir: string, seed: { globalState?: Record<string, unknown>; workspaceState?: Record<string, unknown>; secrets?: Record<string, string> } = {}): any {
  fs.mkdirSync(storageDir, { recursive: true });
  return {
    globalStorageUri: { fsPath: storageDir },
    globalState: createMemento(seed.globalState),
    workspaceState: createMemento(seed.workspaceState),
    secrets: {
      get: async (key: string) => seed.secrets?.[key],
      store: async (key: string, value: string) => { seed.secrets = { ...(seed.secrets || {}), [key]: value }; },
      delete: async (key: string) => { if (seed.secrets) delete seed.secrets[key]; },
    },
  };
}

function createMemento(seed: Record<string, unknown> = {}): any {
  const values = new Map(Object.entries(seed));
  return {
    get: <T>(key: string, defaultValue?: T) => values.has(key) ? values.get(key) as T : defaultValue,
    update: async (key: string, value: unknown) => {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
  };
}

function extractMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '').join('');
}

function liveProviderEnvKeys(provider: string): string[] {
  switch (provider) {
    case 'anthropic': return ['ANTHROPIC_API_KEY', 'ANTHROPIC_LLM_API_KEY', 'CLAUDE_API_KEY'];
    case 'mistral': return ['MISTRAL_API_KEY', 'MISTRAL_LLM_API_KEY'];
    case 'google': return ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
    case 'openrouter': return ['OPENROUTER_API_KEY', 'OPENROUTER_LLM_API_KEY'];
    case 'openai-compatible': return ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY'];
    default: return ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'];
  }
}

function readFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function liveDiagnostics(result: unknown, messages: AgentWorkbenchMessage[], outputLines: string[], workflowPath: string): string {
  const streamEvents = messages.filter((message): message is Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }> => message.type === 'agent.streamEvent').map((message) => message.event);
  return JSON.stringify({
    result,
    workflowPath,
    workflowExists: fs.existsSync(workflowPath),
    lastStreamEvent: streamEvents[streamEvents.length - 1],
    lastMessage: messages[messages.length - 1],
    outputLines,
  }, null, 2);
}
