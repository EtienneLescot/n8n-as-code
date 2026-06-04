import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import { AgentRuntimeController, getAgentProviderSecretKey, type AgentWorkbenchMessage } from '../../src/services/agent-runtime-controller.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env.test'), quiet: true });

const TARGET_WORKFLOW = 'workflows/dev/recherche-annonces-multi-plateformes.workflow.ts';
const OPEN_QUESTION_WORKFLOW = 'workflows/dev/recherche-annonces-leboncoin.workflow.ts';
const OPEN_QUESTION_PROMPT = 'Peux-tu m’expliquer ce workflow et le nœud Form Trigger ? Je veux comprendre le rôle du nœud, le flux des données et les points d’attention si je modifie ce workflow.';
const OPEN_QUESTION_WORKFLOW_OVERRIDE = process.env.N8N_AGENT_WORKBENCH_OPEN_QUESTION_WORKFLOW || OPEN_QUESTION_WORKFLOW;
const OPEN_QUESTION_PROMPT_OVERRIDE = process.env.N8N_AGENT_WORKBENCH_OPEN_QUESTION_PROMPT || OPEN_QUESTION_PROMPT;
const OPEN_QUESTION_TIMEOUT_MS = readNumberEnv('N8N_AGENT_WORKBENCH_OPEN_QUESTION_TIMEOUT_MS', 240_000);
const OPEN_QUESTION_MAX_STREAM_CHARS = readNumberEnv('N8N_AGENT_WORKBENCH_OPEN_QUESTION_MAX_STREAM_CHARS', 24_000);
const OPEN_QUESTION_MAX_FINAL_CHARS = readNumberEnv('N8N_AGENT_WORKBENCH_OPEN_QUESTION_MAX_FINAL_CHARS', 12_000);
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

test('workbench runtime live provider generates a validated workflow', {
  skip: process.env.N8N_AGENT_WORKBENCH_LIVE_PROMPT !== '1',
  timeout: 600_000,
}, async (t) => {
  const provider = chooseLiveProvider();
  const apiKey = readFirstEnv(liveProviderEnvKeys(provider)) || readLiveProviderFallbackSecret(provider);
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

    let result = await controller.sendPrompt({ prompt: EXACT_AUTHORING_PROMPT, workspaceRoot }, async (message) => {
      postedMessages.push(message);
      return true;
    });
    let workflowPath = findAuthoredWorkflowPath(workspaceRoot, result);
    let workflowContent = workflowPath && fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
    let issues = validateProviderGeneratedWorkflow(workflowContent, collectOperationEvents(postedMessages));
    for (let repairAttempt = 1; issues.length && repairAttempt <= 3; repairAttempt += 1) {
      const sessionId = latestSessionId(postedMessages);
      assert.ok(sessionId, liveDiagnostics(result, postedMessages, outputLines, workflowPath, workflowContent, issues));
      result = await controller.sendPrompt({
        prompt: buildLiveRepairPrompt(issues, workflowPath || path.join(workspaceRoot, TARGET_WORKFLOW), workflowContent),
        workspaceRoot,
        sessionId,
      }, async (message) => {
        postedMessages.push(message);
        return true;
      });
      workflowPath = findAuthoredWorkflowPath(workspaceRoot, result) || workflowPath;
      workflowContent = workflowPath && fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
      issues = validateProviderGeneratedWorkflow(workflowContent, collectOperationEvents(postedMessages));
    }

    assert.equal(postedMessages.some((message) => message.type === 'agent.error'), false, liveDiagnostics(result, postedMessages, outputLines, workflowPath, workflowContent, issues));
    assert.ok(workflowPath && fs.existsSync(workflowPath), liveDiagnostics(result, postedMessages, outputLines, workflowPath, workflowContent, issues));
    assert.deepEqual(issues, [], liveDiagnostics(result, postedMessages, outputLines, workflowPath, workflowContent, issues));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('workbench runtime live provider answers an open workflow/node question without runaway output', {
  skip: process.env.N8N_AGENT_WORKBENCH_LIVE_OPEN_QUESTION !== '1',
  timeout: Math.max(OPEN_QUESTION_TIMEOUT_MS + 60_000, 300_000),
}, async (t) => {
  const provider = chooseLiveProvider();
  const apiKey = readFirstEnv(liveProviderEnvKeys(provider)) || readLiveProviderFallbackSecret(provider);
  if (!apiKey && providerRequiresLiveSecret(provider)) {
    t.skip(`Missing credential for live provider ${provider}`);
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8nac-workbench-live-open-question-'));
  const storageDir = path.join(tempDir, '.storage');
  const workspaceRoot = path.join(tempDir, 'workspace');
  const workflowPath = path.join(workspaceRoot, OPEN_QUESTION_WORKFLOW_OVERRIDE);
  const outputLines: string[] = [];
  const postedMessages: AgentWorkbenchMessage[] = [];
  const finalResponses: string[] = [];
  let streamedResponseChars = 0;
  let stopReason: string | undefined;

  try {
    createWorkbenchWorkspace(workspaceRoot);
    const originalWorkflowContent = fs.readFileSync(workflowPath, 'utf8');
    const context = createExtensionContext(storageDir, {
      globalState: {
        'n8n.agent.settingsManaged': true,
        'n8n.agent.provider': provider,
        'n8n.agent.model': process.env.N8N_AGENT_WORKBENCH_LIVE_MODEL || undefined,
        'n8n.agent.baseUrl': process.env.N8N_AGENT_WORKBENCH_LIVE_BASE_URL || undefined,
        'n8n.agent.reasoningEffort': process.env.N8N_AGENT_WORKBENCH_LIVE_REASONING_EFFORT || undefined,
      },
      secrets: apiKey ? {
        [getAgentProviderSecretKey(provider)]: apiKey,
      } : {},
    });
    const controller = new AgentRuntimeController(context, {
      appendLine: (line: string) => outputLines.push(line),
    } as any);
    const startedAt = Date.now();
    const postMessage = async (message: AgentWorkbenchMessage) => {
      postedMessages.push(message);
      if (message.type === 'agent.streamEvent') {
        if (message.event.type === 'text-delta') {
          streamedResponseChars += message.event.delta.length;
        }
        if (message.event.type === 'final') {
          finalResponses.push(message.event.response);
        }
      }
      if (!stopReason && streamedResponseChars > OPEN_QUESTION_MAX_STREAM_CHARS) {
        stopReason = `streamed response exceeded ${OPEN_QUESTION_MAX_STREAM_CHARS} chars`;
        await controller.stop(async (stopMessage) => {
          postedMessages.push(stopMessage);
          return true;
        }, latestSessionId(postedMessages));
      }
      return true;
    };

    const result = await withTimeout(
      controller.sendPrompt({
        prompt: OPEN_QUESTION_PROMPT_OVERRIDE,
        workspaceRoot,
        workflowId: path.basename(OPEN_QUESTION_WORKFLOW_OVERRIDE, '.workflow.ts'),
        workflowName: workflowNameFromFilename(OPEN_QUESTION_WORKFLOW_OVERRIDE),
        workflowFilename: path.basename(OPEN_QUESTION_WORKFLOW_OVERRIDE),
        workflowFilePath: workflowPath,
        nodeContexts: [{ name: 'Form Trigger', type: 'n8n-nodes-base.formTrigger' }],
      }, postMessage),
      OPEN_QUESTION_TIMEOUT_MS,
      async () => {
        stopReason = `run exceeded ${OPEN_QUESTION_TIMEOUT_MS}ms`;
        await controller.stop(postMessage, latestSessionId(postedMessages));
      },
    );
    const elapsedMs = Date.now() - startedAt;
    const finalResponse = finalResponses[finalResponses.length - 1] || '';
    const diagnostics = () => liveOpenQuestionDiagnostics({
      provider,
      model: process.env.N8N_AGENT_WORKBENCH_LIVE_MODEL,
      result,
      elapsedMs,
      stopReason,
      streamedResponseChars,
      finalResponse,
      messages: postedMessages,
      outputLines,
    });

    assert.equal(stopReason, undefined, diagnostics());
    assert.equal(postedMessages.some((message) => message.type === 'agent.error'), false, diagnostics());
    assert.equal(result.workflowChanged, false, diagnostics());
    assert.equal(fs.readFileSync(workflowPath, 'utf8'), originalWorkflowContent, diagnostics());
    assert.equal(finalResponses.length, 1, diagnostics());
    assert.ok(finalResponse.trim().length > 0, diagnostics());
    assert.ok(finalResponse.length <= OPEN_QUESTION_MAX_FINAL_CHARS, diagnostics());
    assert.equal(outputLines.some((line) => line.includes('recovering non-final assistant phase=unknown')), false, diagnostics());
    assert.match(finalResponse, /Form Trigger|form|workflow|flux|nœud|noeud/i, diagnostics());
    assert.match(finalResponse, /workflow|flux|donn/i, diagnostics());
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
    `When creating the multi-platform annonces workflow, write it to ${TARGET_WORKFLOW}.`,
    'Before workflow commands, run n8nac workspace migrate --json then workspace status --json.',
  ].join('\n'));
  fs.writeFileSync(path.join(rootDir, '.agents', 'skills', 'n8n-architect', 'SKILL.md'), [
    '---',
    'name: n8n-architect',
    'description: Create and validate n8n-as-code TypeScript workflows.',
    '---',
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
  fs.writeFileSync(path.join(rootDir, 'workflows', 'dev', 'moteur-recherche-annonces-multi-plateformes.workflow.ts'), createMultiPlatformSearchWorkflowSource());
  fs.writeFileSync(path.join(rootDir, 'n8nac-config.json'), JSON.stringify({ version: 1, environments: {} }, null, 2));
}

function createMultiPlatformSearchWorkflowSource(): string {
  return `import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({ name: 'Moteur Recherche Annonces Multi Plateformes', active: false })
export class MoteurRechercheAnnoncesMultiPlateformesWorkflow {
  @node({ name: 'Form Trigger', type: 'n8n-nodes-base.formTrigger', version: 2, parameters: { formTitle: 'Recherche annonce', formFields: { values: [{ fieldLabel: 'Recherche libre', fieldType: 'textarea' }, { fieldLabel: 'Résultats maximum', fieldType: 'number' }] } } })
  FormTrigger = {};

  @node({ name: 'Extract Search Criteria', type: '@n8n/n8n-nodes-langchain.agent', version: 2, parameters: { promptType: 'define', text: 'Transforme la recherche libre en critères structurés.' } })
  ExtractSearchCriteria = {};

  @node({ name: 'Build Platform Queries', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'return [{ json: { queries: [\"site:leboncoin.fr\", \"site:ebay.fr\", \"site:paruvendu.fr\"] } }];' } })
  BuildPlatformQueries = {};

  @node({ name: 'Fetch Search Results', type: 'n8n-nodes-base.httpRequest', version: 4, parameters: { method: 'GET', url: 'https://example.com/search' } })
  FetchSearchResults = {};

  @node({ name: 'Extract Candidate Ads', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'return items.map((item) => ({ json: { title: item.json.title || \"Annonce\", url: item.json.url, platform: item.json.platform } }));' } })
  ExtractCandidateAds = {};

  @node({ name: 'Score Candidate Ads', type: '@n8n/n8n-nodes-langchain.agent', version: 2, parameters: { promptType: 'define', text: 'Score uniquement les annonces candidates fournies.' } })
  ScoreCandidateAds = {};

  @node({ name: 'Render Results Page', type: 'n8n-nodes-base.code', version: 2, parameters: { jsCode: 'return [{ json: { html: \"<html><body><h1>Résultats</h1></body></html>\" } }];' } })
  RenderResultsPage = {};

  @links()
  defineRouting() {}
}
`;
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
    case 'openai-oauth': return ['N8N_AGENT_WORKBENCH_LIVE_OPENAI_OAUTH_TOKEN', 'N8N_AGENT_WORKBENCH_OPENAI_OAUTH_TOKEN', 'OPENAI_OAUTH_ACCESS_TOKEN', 'OPENAI_CODEX_ACCESS_TOKEN'];
    case 'openai-compatible': return ['OPENAI_COMPATIBLE_API_KEY', 'OPENAI_API_KEY'];
    default: return ['OPENAI_API_KEY', 'OPENAI_LLM_API_KEY', 'OPENAI_KEY'];
  }
}

function chooseLiveProvider(): string {
  const configured = process.env.N8N_AGENT_WORKBENCH_LIVE_PROVIDER?.trim();
  if (configured) return configured;
  const candidates = ['google', 'openai', 'anthropic', 'mistral', 'openrouter', 'openai-compatible', 'openai-oauth'];
  return candidates.find((provider) => Boolean(readFirstEnv(liveProviderEnvKeys(provider)))) || 'openai';
}

function providerRequiresLiveSecret(provider: string): boolean {
  return provider !== 'openai-compatible' && provider !== 'openai-oauth';
}

function readLiveProviderFallbackSecret(provider: string): string | undefined {
  if (provider !== 'openai-oauth') return undefined;
  return readOpenAiAccountAccessTokenFromCodexAuth();
}

function readOpenAiAccountAccessTokenFromCodexAuth(): string | undefined {
  const authPath = process.env.N8N_CODEX_AUTH_PATH || path.join(os.homedir(), '.codex', 'auth.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8')) as Record<string, any>;
    const token = typeof parsed.tokens?.access_token === 'string'
      ? parsed.tokens.access_token.trim()
      : typeof parsed.access_token === 'string'
        ? parsed.access_token.trim()
        : '';
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Promise<void>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      void onTimeout().finally(() => reject(new Error(`Timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function readNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function workflowNameFromFilename(filePath: string): string {
  return path.basename(filePath, '.workflow.ts')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function readFirstEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function findAuthoredWorkflowPath(workspaceRoot: string, result: unknown): string | undefined {
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const isWithinWorkspace = (candidatePath: string): boolean => {
    const relative = path.relative(resolvedWorkspaceRoot, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };

  const resultPath = result && typeof result === 'object' && typeof (result as { workflowContext?: { filePath?: unknown } }).workflowContext?.filePath === 'string'
    ? (result as { workflowContext: { filePath: string } }).workflowContext.filePath
    : undefined;
  const candidates = [
    resultPath,
    path.join(workspaceRoot, TARGET_WORKFLOW),
    ...listWorkflowFiles(path.join(workspaceRoot, 'workflows')).filter((filePath) => !filePath.endsWith('recherche-annonces-leboncoin.workflow.ts')),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => {
    const resolved = path.resolve(path.isAbsolute(candidate) ? candidate : path.join(workspaceRoot, candidate));
    return fs.existsSync(resolved) && resolved.endsWith('.workflow.ts') && isWithinWorkspace(resolved) ? resolved : undefined;
  });
}

function listWorkflowFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listWorkflowFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.workflow.ts') ? [entryPath] : [];
  });
}

function assertProviderGeneratedWorkflow(content: string, diagnostics: string): void {
  assert.deepEqual(validateProviderGeneratedWorkflow(content, []), [], diagnostics);
}

function validateProviderGeneratedWorkflow(content: string, operationEvents: Array<Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }>['event']>): string[] {
  const issues: string[] = [];
  if (!content.trim()) issues.push('workflow file was not created or is empty');
  if (content.trim() === workflowSource().trim()) issues.push('workflow must be generated by the provider, not the deterministic fixture');
  if (!/<workflow-map>/.test(content)) issues.push('missing <workflow-map> block');
  if (!/@workflow\s*\(/.test(content)) issues.push('missing @workflow decorator');
  if (!/@node\s*\(/.test(content)) issues.push('missing @node decorators');
  if (!/@links\s*\(/.test(content)) issues.push('missing @links decorator');
  if ((content.match(/@node\s*\(/g) || []).length < 8) issues.push('expected at least 8 @node decorators for the requested architecture');
  if (!/Form Trigger|formTrigger/i.test(content)) issues.push('missing Form Trigger node');
  if (!/agent|langchain/i.test(content)) issues.push('missing AI agent nodes');
  if (!/outputParserStructured|structured output|parser structuré|structured parser/i.test(content)) issues.push('missing structured parser nodes for LLM outputs');
  if (!/httpRequest|Bing|RSS|Jina|Leboncoin/i.test(content)) issues.push('missing HTTP/search platform retrieval nodes');
  if (!/steering|ajustement|relancer|Form/i.test(content)) issues.push('missing steering/adjustment loop');
  if (!/\.uses\s*\(/.test(content)) issues.push('missing .uses() connections for AI sub-nodes');
  if (/@workflow\s*\(\s*\{[\s\S]{0,1000}\bnodes\s*:/.test(content)) issues.push('@workflow must not contain raw n8n nodes object; use @node-decorated class properties');
  if (/"""/.test(content)) issues.push('workflow contains Python-style triple quotes, which is invalid TypeScript');
  if (/credentialId|credentials\s*:\s*\{[^}]*id/i.test(content)) issues.push('workflow must not hardcode credential IDs or placeholders');
  if (/(?:api[_-]?key|secret|token)\s*[:=]\s*['"][^'"]+['"]/i.test(content)) issues.push('workflow must not hardcode secrets');
  if (!operationEvents.some((event) => event.type === 'operation' && event.label === 'Write File' && event.status === 'done')) issues.push('provider did not complete a write_file operation');
  if (!operationEvents.some((event) => event.type === 'operation' && event.label === 'Execute' && event.status === 'done')) issues.push('provider did not complete an execute operation to check schemas or validate');
  return issues;
}

function buildLiveRepairPrompt(issues: string[], workflowPath: string, currentContent: string): string {
  return [
    'The workflow you generated is not acceptable yet. Continue the same task and repair the workflow now.',
    `Target file: ${workflowPath}`,
    '',
    'Validation issues:',
    ...issues.map((issue) => `- ${issue}`),
    '',
    'Mandatory repair steps:',
    '1. Use execute to check at least the Form Trigger, HTTP Request, LangChain Agent, and Structured Output Parser schemas or to run a local validation command.',
    '2. Replace the workflow file with complete decorator-based TypeScript using @workflow, @node, and @links class members.',
    '3. Do not use raw @workflow({ nodes: ... }) JSON-style definitions.',
    '4. Do not include credentials, credential IDs, API keys, tokens, or placeholders like CHANGE_ME.',
    '5. Connect AI sub-nodes with .uses().',
    '6. Use structured parser nodes for criteria extraction and selected-annonce output.',
    '7. Include the iterative steering loop.',
    '8. End only after writing the corrected file and validating it.',
    '',
    'Current file content:',
    '```ts',
    currentContent.slice(0, 12000),
    '```',
  ].join('\n');
}

function latestSessionId(messages: AgentWorkbenchMessage[]): string | undefined {
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (message.type === 'agent.state') return message.state.activeSessionId;
  }
  return undefined;
}

function collectOperationEvents(messages: AgentWorkbenchMessage[]): Array<Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }>['event']> {
  return messages
    .filter((message): message is Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }> => message.type === 'agent.streamEvent')
    .map((message) => message.event)
    .filter((event) => event.type === 'operation');
}

function liveDiagnostics(result: unknown, messages: AgentWorkbenchMessage[], outputLines: string[], workflowPath?: string, workflowContent?: string, issues: string[] = []): string {
  const streamEvents = messages.filter((message): message is Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }> => message.type === 'agent.streamEvent').map((message) => message.event);
  const operationEvents = streamEvents.filter((event) => event.type === 'operation').map((event) => `${event.label}:${event.status}:${event.summary || ''}`);
  return JSON.stringify({
    result,
    issues,
    workflowPath,
    workflowExists: Boolean(workflowPath && fs.existsSync(workflowPath)),
    workflowContentLength: workflowContent?.length ?? 0,
    operationEvents,
    lastStreamEvent: streamEvents[streamEvents.length - 1],
    lastMessage: messages[messages.length - 1],
    outputLines,
  }, null, 2);
}

function liveOpenQuestionDiagnostics(input: {
  provider: string;
  model?: string;
  result: unknown;
  elapsedMs: number;
  stopReason?: string;
  streamedResponseChars: number;
  finalResponse: string;
  messages: AgentWorkbenchMessage[];
  outputLines: string[];
}): string {
  const streamEvents = input.messages
    .filter((message): message is Extract<AgentWorkbenchMessage, { type: 'agent.streamEvent' }> => message.type === 'agent.streamEvent')
    .map((message) => message.event);
  const operationEvents = streamEvents
    .filter((event) => event.type === 'operation')
    .map((event) => `${event.label}:${event.status}:${event.category}:${event.summary || ''}`);
  const finalEvents = streamEvents.filter((event) => event.type === 'final');
  return JSON.stringify({
    provider: input.provider,
    model: input.model,
    elapsedMs: input.elapsedMs,
    stopReason: input.stopReason,
    result: input.result,
    streamedResponseChars: input.streamedResponseChars,
    finalResponseChars: input.finalResponse.length,
    finalResponseExcerpt: input.finalResponse.slice(0, 2000),
    finalEventCount: finalEvents.length,
    operationEvents,
    errors: input.messages.filter((message) => message.type === 'agent.error'),
    lastStreamEvent: streamEvents[streamEvents.length - 1],
    lastMessage: input.messages[input.messages.length - 1],
    outputLines: input.outputLines,
  }, null, 2);
}
