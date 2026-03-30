import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to get __dirname in ESM
const _filename = typeof __filename !== 'undefined'
  ? __filename
  : (typeof import.meta !== 'undefined' && typeof import.meta.url === 'string' ? fileURLToPath(import.meta.url) : '');

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : (_filename ? path.dirname(_filename as string) : '');

export class AiContextGenerator {
  private nodesIndex: Record<string, any> | null = null;

  constructor() { }

  /**
   * Lazily loads n8n-nodes-technical.json and returns the nodes map.
   * Resolution order mirrors NodeSchemaProvider:
   *   1. N8N_AS_CODE_ASSETS_DIR env var
   *   2. Relative sibling paths (dist/assets, then ../../assets)
   * Returns an empty object when the asset is unavailable (e.g. in tests).
   */
  private loadNodesIndex(): Record<string, any> {
    if (this.nodesIndex) return this.nodesIndex;
    const envAssetsDir = process.env.N8N_AS_CODE_ASSETS_DIR;
    const candidates = [
      ...(envAssetsDir ? [path.join(envAssetsDir, 'n8n-nodes-technical.json')] : []),
      path.resolve(_dirname, '../assets/n8n-nodes-technical.json'),
      path.resolve(_dirname, '../../assets/n8n-nodes-technical.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          this.nodesIndex = JSON.parse(fs.readFileSync(p, 'utf-8')).nodes ?? {};
          return this.nodesIndex!;
        } catch { /* ignore parse errors */ }
      }
    }
    this.nodesIndex = {};
    return this.nodesIndex;
  }

  /**
   * Returns the highest typeVersion for a node looked up by its short name
   * (the key in n8n-nodes-technical.json, e.g. 'lmChatOpenAi').
   * Falls back to the given fallback when the node is not found.
   */
  private latestVersion(nodeShortName: string, fallback: number): number {
    const nodes = this.loadNodesIndex();
    const node = nodes[nodeShortName];
    if (!node) return fallback;
    const versions = Array.isArray(node.version) ? node.version : [node.version];
    return Math.max(...versions.map((v: any) => Number(v)));
  }

  private getCommandRefs(distTag?: string): { cliCmd: string; skillsCmd: string } {
    return {
      skillsCmd: distTag ? `npx --yes n8nac@${distTag} skills` : 'npx --yes n8nac skills',
      cliCmd: distTag ? `npx --yes n8nac@${distTag}` : 'npx --yes n8nac',
    };
  }

  /**
   * Returns the canonical AI Agent workflow example TypeScript code.
   * Shared between AGENTS.md and the skill prompt to keep both in sync.
   * Node versions are resolved dynamically from n8n-nodes-technical.json
   * so the example never goes stale.
   */
  private getAiAgentWorkflowExampleCode(): string {
    // Resolve latest typeVersion for each node used in the example
    const vChatTrigger        = this.latestVersion('chatTrigger', 1.1);
    const vAgent              = this.latestVersion('agent', 3);
    const vLmChatOpenAi       = this.latestVersion('lmChatOpenAi', 1.3);
    const vMemoryBufferWindow = this.latestVersion('memoryBufferWindow', 1.3);
    const vHttpRequestTool    = this.latestVersion('httpRequestTool', 1.1);
    const vOutputParser       = this.latestVersion('outputParserStructured', 1.3);

    return [
      `import { workflow, node, links } from '@n8n-as-code/transformer';`,
      ``,
      `// <workflow-map>`,
      `// Workflow : AI Agent`,
      `// Nodes   : 6  |  Connections: 1`,
      `//`,
      `// NODE INDEX`,
      `// ──────────────────────────────────────────────────────────────────`,
      `// Property name                    Node type (short)         Flags`,
      `// ChatTrigger                      chatTrigger`,
      `// AiAgent                          agent                      [AI]`,
      `// OpenaiModel                      lmChatOpenAi               [creds] [ai_languageModel]`,
      `// Memory                           memoryBufferWindow         [ai_memory]`,
      `// SearchTool                       httpRequestTool            [ai_tool]`,
      `// OutputParser                     outputParserStructured     [ai_outputParser]`,
      `//`,
      `// ROUTING MAP`,
      `// ──────────────────────────────────────────────────────────────────`,
      `// ChatTrigger`,
      `//   → AiAgent`,
      `//`,
      `// AI CONNECTIONS`,
      `// AiAgent.uses({ ai_languageModel: OpenaiModel, ai_memory: Memory, ai_outputParser: OutputParser, ai_tool: [SearchTool] })`,
      `// </workflow-map>`,
      ``,
      `@workflow({ name: 'AI Agent', active: false })`,
      `export class AIAgentWorkflow {`,
      `  @node({ name: 'Chat Trigger', type: '@n8n/n8n-nodes-langchain.chatTrigger', version: ${vChatTrigger}, position: [0, 0] })`,
      `  ChatTrigger = {};`,
      ``,
      `  @node({ name: 'AI Agent', type: '@n8n/n8n-nodes-langchain.agent', version: ${vAgent}, position: [200, 0] })`,
      `  AiAgent = {`,
      `    promptType: 'define',`,
      `    text: '={{ $json.chatInput }}',`,
      `    options: { systemMessage: 'You are a helpful assistant.' },`,
      `  };`,
      ``,
      `  @node({ name: 'OpenAI Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', version: ${vLmChatOpenAi}, position: [200, 200],`,
      `    credentials: { openAiApi: { id: 'xxx', name: 'OpenAI' } } })`,
      `  OpenaiModel = { model: { mode: 'list', value: 'gpt-4o-mini' }, options: {} };`,
      ``,
      `  @node({ name: 'Memory', type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', version: ${vMemoryBufferWindow}, position: [300, 200] })`,
      `  Memory = { sessionIdType: 'customKey', sessionKey: '={{ $execution.id }}', contextWindowLength: 10 };`,
      ``,
      `  @node({ name: 'Search Tool', type: 'n8n-nodes-base.httpRequestTool', version: ${vHttpRequestTool}, position: [400, 200] })`,
      `  SearchTool = { url: 'https://api.example.com/search', toolDescription: 'Search for information' };`,
      ``,
      `  @node({ name: 'Output Parser', type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: ${vOutputParser}, position: [500, 200] })`,
      `  OutputParser = { schemaType: 'manual', inputSchema: '{ "type": "object", "properties": { "answer": { "type": "string" } } }' };`,
      ``,
      `  @links()`,
      `  defineRouting() {`,
      `    // Regular data flow: use .out(0).to(target.in(0))`,
      `    this.ChatTrigger.out(0).to(this.AiAgent.in(0));`,
      ``,
      `    // AI sub-node connections: ALWAYS use .uses(), NEVER .out().to() for these`,
      `    this.AiAgent.uses({`,
      `      ai_languageModel: this.OpenaiModel.output,   // single ref → this.Node.output`,
      `      ai_memory: this.Memory.output,               // single ref`,
      `      ai_outputParser: this.OutputParser.output,    // single ref`,
      `      ai_tool: [this.SearchTool.output],            // array ref → [this.Node.output, ...]`,
      `    });`,
      `  }`,
      `}`,
    ].join('\n');
  }

  private getWorkspaceBootstrapLines(cliCmd: string): string[] {
    return [
      `## 🚀 Workspace Bootstrap (MANDATORY)`,
      ``,
      `Before using any \`n8nac\` workflow command, check whether the workspace is initialized.`,
      ``,
      `### Initialization Check`,
      `- Look for \`n8nac-config.json\` in the workspace root.`,
      `- If \`n8nac-config.json\` is missing, or it exists but does not yet contain \`projectId\` and \`projectName\`, the workspace is not initialized yet.`,
      `- **NEVER tell the user to run \`npx n8nac init\` themselves.** You are the agent — it is YOUR job to run the command.`,
      `- Initialization is a 2-step flow: first save credentials with \`${cliCmd} init-auth --host <url> --api-key <key>\`, then select the project with \`${cliCmd} init-project\`.`,
      `- If the user has already provided the n8n host and API key, run \`${cliCmd} init-auth --host <url> --api-key <key>\` immediately.`,
      `- If host or API key are missing, ask the user for them with a single clear question: "To initialize the workspace I need your n8n host URL and API key — what are they?" Then, once you have both values, run \`${cliCmd} init-auth --host <url> --api-key <key>\` yourself.`,
      `- Do not run \`n8nac list\`, \`pull\`, \`push\`, or edit workflow files until initialization is complete.`,
      `- Never write \`n8nac-config.json\` by hand. Initialization must go through \`${cliCmd} init-auth\` and \`${cliCmd} init-project\` so credentials and AI context stay consistent.`,
      `- Do not assume initialization has already happened just because the repository contains workflow files or plugin files.`,
      ``,
      `### Preferred Agent Command`,
      `- Step 1 auth: \`${cliCmd} init-auth --host <url> --api-key <key>\``,
      `- Step 2 project selection: \`${cliCmd} init-project --project-id <id>|--project-name <name>|--project-index <n> [--sync-folder <path>]\``,
      `- \`${cliCmd} init-project\` can run interactively after \`${cliCmd} init-auth\`, or non-interactively when the project selector is known.`,
      ``,
      `### Required Order`,
      `1. Check for \`n8nac-config.json\`.`,
      `2. If missing: check if \`N8N_HOST\` and \`N8N_API_KEY\` are set in the environment — if so, run \`${cliCmd} init-auth --host <url> --api-key <key>\` directly using those values.`,
      `3. If missing and env vars are absent: ask the user for the host URL and API key, then run \`${cliCmd} init-auth --host <url> --api-key <key>\` yourself. **Do not ask the user to run the command.**`,
      `4. After credentials are saved, inspect the listed projects. If only one project exists, run \`${cliCmd} init-project --project-index 1 --sync-folder workflows\`. If multiple projects exist, ask the user which one to use, then run \`${cliCmd} init-project --project-id <id> [--sync-folder <path>]\`.`,
      `5. Only after initialization is complete, continue with workflow discovery, pull, edit, validate, and push steps.`,
      ``,
      `---`,
      ``,
    ];
  }

  private getWorkflowMapGuidanceLines(): string[] {
    return [
      `## 🗺️ Reading Workflow Files Efficiently`,
      ``,
      `Every \`.workflow.ts\` file starts with a \`<workflow-map>\` block — a compact index generated automatically at each sync. Always read this block first before opening the rest of the file.`,
      ``,
      `\`\`\``,
      `// <workflow-map>`,
      `// Workflow : My Workflow`,
      `// Nodes   : 12  |  Connections: 14`,
      `//`,
      `// NODE INDEX`,
      `// ──────────────────────────────────────────────────────────────────`,
      `// Property name                    Node type (short)         Flags`,
      `// ScheduleTrigger                  scheduleTrigger`,
      `// AgentGenerateApplication         agent                      [AI] [creds]`,
      `// OpenaiChatModel                  lmChatOpenAi               [creds] [ai_languageModel]`,
      `// Memory                           memoryBufferWindow         [ai_memory]`,
      `// GithubCheckBranchRef             httpRequest                [onError→out(1)]`,
      `//`,
      `// ROUTING MAP`,
      `// ──────────────────────────────────────────────────────────────────`,
      `// ⚠️ Nodes flagged [ai_*] are NOT in the → routing — they connect via .uses()`,
      `// ScheduleTrigger`,
      `//   → Configuration1`,
      `//     → BuildProfileSources → LoopOverProfileSources`,
      `//       .out(1) → JinaReadProfileSource → LoopOverProfileSources (↩ loop)`,
      `//`,
      `// AI CONNECTIONS`,
      `// AgentGenerateApplication.uses({ ai_languageModel: OpenaiChatModel, ai_memory: Memory })`,
      `// </workflow-map>`,
      `\`\`\``,
      ``,
      `### How to navigate a workflow as an agent`,
      ``,
      `1. Read \`<workflow-map>\` only — locate the property name you need.`,
      `2. Search for that property name in the file (for example \`AgentGenerateApplication =\`).`,
      `3. Read only that section — do not load the entire file into context.`,
      ``,
      `This avoids loading 1500+ lines when you only need to patch 10.`,
      ``,
    ];
  }

  private getSharedToolGuidanceLines(skillsCmd: string): string[] {
    return [
      `### AI Tool Nodes`,
      ``,
      `When an AI agent uses tool nodes:`,
      ``,
      `- ✅ Search for the exact tool node first.`,
      `- ✅ Run \`${skillsCmd} node-info <nodeName>\` before writing parameters.`,
      `- ✅ Connect tool nodes as arrays: \`this.Agent.uses({ ai_tool: [this.Tool.output] })\`.`,
      `- ❌ Do not assume tool parameter names or reuse stale node-specific guidance.`,
      ``,
    ];
  }

  private getSharedResponseFormatLines(cliCmd: string): string[] {
    return [
      `## 📝 Response Format`,
      ``,
      `When helping users:`,
      ``,
      `1. Acknowledge what they want to achieve.`,
      `2. Check initialization by verifying whether \`n8nac-config.json\` exists in the workspace root.`,
      `3. If not initialized, ask the user for the host URL and API key if needed, then run \`${cliCmd} init-auth\` and \`${cliCmd} init-project\` yourself.`,
      `4. Pull the workflow before any modification and show the command.`,
      `5. For a new workflow, create the file inside the active local workflow directory and confirm it appears in \`${cliCmd} list --local\` before pushing.`,
      `6. Search for the relevant nodes and show the command you are running.`,
      `7. Retrieve the exact schema.`,
      `8. Generate the TypeScript configuration using the schema.`,
      `9. Explain the key parameters and any credentials needed.`,
      `10. Push the workflow after modification and show the command.`,
      `11. For webhook/chat/form workflows: run \`${cliCmd} test-plan <id>\` after pushing to inspect trigger, endpoints, and suggested payload.`,
      `    - Then run \`${cliCmd} test <id>\` with the inferred payload when runtime validation is needed.`,
      `    - If **Class A** (config gap): report what the user needs to configure — do NOT re-edit the code.`,
      `    - If **Class B** (wiring error): fix the issue, push again, and re-test.`,
      ``,
      `---`,
      ``,
      `Remember: Check initialization first. Pull before you modify. Push after you modify. Inspect then test webhook/chat/form workflows after push. Never guess parameters — always verify against the schema.`,
    ];
  }

  async generate(projectRoot: string, n8nVersion: string = "Unknown", distTag?: string): Promise<void> {
    const agentsContent = this.getAgentsContent(n8nVersion, distTag);

    // 1. AGENTS.md (Central documentation)
    this.injectOrUpdate(path.join(projectRoot, 'AGENTS.md'), agentsContent, true);
  }

  private injectOrUpdate(filePath: string, content: string, isMarkdownFile: boolean = false): void {
    const startMarker = isMarkdownFile ? '<!-- n8n-as-code-start -->' : '### 🤖 n8n-as-code-start';
    const endMarker = isMarkdownFile ? '<!-- n8n-as-code-end -->' : '### 🤖 n8n-as-code-end';

    const block = `\n${startMarker}\n${content.trim()}\n${endMarker}\n`;

    if (!fs.existsSync(filePath)) {
      // Create new file with header if it's AGENTS.md
      const header = filePath.endsWith('AGENTS.md') ? '# 🤖 AI Agents Guidelines\n' : '';
      fs.writeFileSync(filePath, header + block.trim() + '\n');
      return;
    }

    let existing = fs.readFileSync(filePath, 'utf8');
    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      // Update existing block while preserving what's before/after
      const before = existing.substring(0, startIdx);
      const after = existing.substring(endIdx + endMarker.length);
      fs.writeFileSync(filePath, before + block.trim() + after);
    } else {
      // Append to end of existing file
      fs.writeFileSync(filePath, existing.trim() + '\n' + block);
    }
  }

  private getAgentsContent(n8nVersion: string, distTag?: string): string {
    const { cliCmd, skillsCmd: cmd } = this.getCommandRefs(distTag);
    return [
      `## 🎭 Role: Expert n8n Workflow Engineer`,
      ``,
      `You are a specialized AI agent for creating and editing n8n workflows.`,
      `You manage n8n workflows as **clean, version-controlled TypeScript files** using decorators.`,
      ``,
      `### 🌍 Context`,
      `- **n8n Version**: ${n8nVersion}`,
      `- **Source of Truth**: \`${cmd}\` tools (Deep Search + Technical Schemas)`,
      ``,
      `---`,
      ``,
      ...this.getWorkspaceBootstrapLines(cliCmd),
      `## 🔄 GitOps & Synchronization Protocol (CRITICAL)`,
      ``,
      `n8n-as-code uses a **Git-like sync architecture**. The local code is the source of truth, but the user might have modified the workflow in the n8n UI.`,
      ``,
      `**⚠️ CRITICAL RULE**: Before modifying ANY existing \`.workflow.ts\` file, you MUST follow the git-like workflow:`,
      ``,
      `### Git-like Sync Workflow`,
      ``,
      `1. **LIST FIRST**: Check status with \`${cliCmd} list\``,
      `   - \`${cliCmd} list\`: List all workflows with their sync status (lightweight — only reads metadata).`,
      `   - \`${cliCmd} list --local\`: List only local \`.workflow.ts\` files.`,
      `   - \`${cliCmd} list --remote\`: List only remote workflows.`,
      `   - Identify workflow IDs, filenames, and sync status.`,
      `   - Read \`n8nac-config.json\` to understand the active sync context. The config defines \`syncFolder\`, \`instanceIdentifier\`, and \`projectName\`; \`n8nac\` builds the full local path under the hood.`,
      `   - Always run \`${cliCmd}\` from the workspace root. Never construct sync paths manually.`,
      ``,
      `2. **PULL IF NEEDED**: Download remote changes before editing`,
      `   - \`${cliCmd} pull <id>\`: Download workflow from n8n to local.`,
      `   - Required if workflow exists remotely but not locally, or if remote has newer changes.`,
      ``,
      `3. **EDIT / CREATE LOCALLY**: Work on the local \`.workflow.ts\` file inside the active workflow directory.`,
      `   - For an existing workflow: edit the pulled local file.`,
      `   - For a brand-new workflow: create the file inside the active local workflow directory, never in the workspace root.`,
      `   - First try to discover that directory from existing local workflow paths via \`${cliCmd} list --local\`.`,
      `   - If there are no local workflows yet, run \`${cliCmd} list\` and use the directory portion of any reported \`Local Path\` as the active local workflow directory.`,
      `   - Do **not** guess the directory from the instance identifier alone. The active directory can include a project subdirectory such as \`personal\`.`,
      `   - Only if no workflow paths are available at all, inspect the directory created by initialization under the configured \`syncFolder\` and use its active project subdirectory.`,
      `   - After writing a new file, confirm it appears in \`${cliCmd} list --local\` before running \`${cliCmd} push <filename>\` with the full filename such as \`slack-notification.workflow.ts\`.`,
      ``,
      `4. **PUSH**: Upload your changes explicitly`,
      `   - \`${cliCmd} push <filename>\`: Upload the local workflow file to n8n. This is the only public push form.`,
      `   - \`${cliCmd} push <filename> --verify\`: Push and immediately verify the live workflow against the local schema.`,
      ``,
      `   > ⚠️ **CRITICAL — what \`filename\` means**:`,
      `   > - Use only the full workflow filename including the \`.workflow.ts\` suffix, for example \`slack-notification.workflow.ts\`.`,
      `   > - Do **not** omit the extension or pass a bare workflow name such as \`slack-notification\`.`,
      `   > - Do **not** pass a path. \`n8nac\` resolves the real local path from \`n8nac-config.json\`.`,
      `   > - Do **not** use the workflow title from n8n as a CLI argument.`,
      `   > - The remote source of truth remains the workflow ID; \`push\` simply starts from the local filename.`,
      ``,
      `5. **VERIFY (strongly recommended)**: After any push, validate the live workflow`,
      `   - \`${cliCmd} verify <id>\`: Fetches the workflow from n8n and checks all nodes against the schema.`,
      `   - Detects: invalid \`typeVersion\` (e.g. 1.6 when schema only has 2.2), invalid \`operation\` values (e.g. 'post' vs 'create'), missing required params, unknown node types.`,
      `   - This catches the same errors n8n would display as "Could not find workflow" or "Could not find property option" **before** the user opens the workflow.`,
      ``,
      `6. **INSPECT TEST PLAN (recommended for webhook/chat/form workflows)**: Determine whether and how the workflow can be tested`,
      `   - \`${cliCmd} test-plan <id>\`: Detects the trigger type, decides whether the workflow is HTTP-testable, and returns suggested endpoints plus an inferred payload.`,
      `   - Use \`--json\` when an agent needs structured output.`,
      `   - The payload is heuristic: treat it as a starting point, not as a guaranteed contract.`,
      `   - Skip this step for Schedule or generic polling triggers when the command reports them as non-testable.`,
      ``,
      `7. **TEST (recommended for webhook/chat/form workflows)**: Execute the workflow in test mode`,
      `   - \`${cliCmd} test <id>\`: Detects the trigger type, calls the test-mode webhook URL, and reports the result.`,
      `   - Works for workflows whose first trigger is a **Webhook**, **Chat Trigger**, or **Form Trigger**.`,
      `   - Does NOT work for Schedule or generic polling triggers (those cannot be called via HTTP).`,
      ``,
      `   ### ⚠️  Critical: Error Classification`,
      ``,
      `   \`n8nac test\` classifies failures into two classes:`,
      ``,
      `   **Class A — Configuration gap** (exit 0, do NOT iterate):`,
      `   - Missing credentials, unset LLM model, missing environment variable.`,
      `   - These are NOT bugs in the workflow code — they are setup tasks the user must complete in the n8n UI.`,
      `   - When you see \`⚠  Configuration gap detected (Class A)\`, stop and inform the user what to configure.`,
      `   - **Do NOT re-push or re-edit the workflow** to try to fix a Class A error — you cannot fix credentials in code.`,
      ``,
      `   **Class B — Wiring error** (exit 1, fix and re-test):`,
      `   - Bad expression, wrong field name, HTTP error caused by the workflow logic.`,
      `   - These ARE fixable by editing the \`.workflow.ts\` file.`,
      `   - When you see \`❌ Workflow execution failed (Class B)\`, fix the wiring, push, and \`n8nac test\` again.`,
      ``,
      `   > \`validate\` ≠ \`test\`: a workflow can pass static validation but still fail at runtime (Class A/B).`,
      `   > Always run \`test\` after \`verify\` for webhook-driven workflows before declaring the workflow done.`,
      ``,
      `8. **RESOLVE CONFLICTS**: If Push or Pull fails due to a conflict`,
      `   - \`${cliCmd} resolve <id> --mode keep-current\`: Force-push local version.`,
      `   - \`${cliCmd} resolve <id> --mode keep-incoming\`: Force-pull remote version.`,
      ``,
      `### Key Principles`,
      `- **Explicit over automatic**: All operations are user-triggered or ai-agent-triggered.`,
      `- **Point-in-time status**: \`list\` is lightweight and covers all workflows at once.`,
      `- **Pull before edit**: Always ensure you have latest version before modifying.`,
      `- **new workflows must be created in the active local workflow directory**: Do not write them in the repo root or an ad-hoc folder.`,
      `- **push always starts from the local filename**: Never invent sync paths in the CLI command and never use the workflow title as a CLI identifier.`,
      `- **inspect then test after push for webhook/chat/form workflows**: Run \`${cliCmd} test-plan <id>\` first, then \`${cliCmd} test <id>\`. A Class A error is not a bug — tell the user. A Class B error is fixable — iterate.`,
      ``,
      `> \`pull\` and \`resolve\` always operate on **a single workflow ID**. \`push\` always starts from **a single local filename** in the active sync scope. \`list\` is the only command that covers all workflows at once.`,
      ``,
      `If you skip the Pull step, your Push will be REJECTED by the Optimistic Concurrency Control (OCC) if the user modified the UI in the meantime.`,
      ``,
      `---`,
      ``,
      `## 🔬 MANDATORY Research Protocol`,
      ``,
      `**⚠️ CRITICAL**: Before creating or editing ANY node, you MUST follow this protocol:`,
      ``,
      `### Step 0: Pattern Discovery (Intelligence Gathering)`,
      `\`\`\`bash`,
      `${cmd} examples search "telegram chatbot"`,
      `\`\`\``,
      `- **GOAL**: Don't reinvent the wheel. See how experts build it.`,
      `- **ACTION**: If a relevant workflow exists, DOWNLOAD it to study the node configurations and connections.`,
      `- **LEARNING**: extracting patterns > guessing parameters.`,
      ``,
      `### Step 1: Search for the Node`,
      `\`\`\`bash`,
      `${cmd} search "google sheets"`,
      `\`\`\``,
      `- Find the **exact node name** (camelCase: e.g., \`googleSheets\`)`,
      `- Verify the node exists in current n8n version`,
      ``,
      `### Step 2: Get Exact Schema`,
      `\`\`\`bash`,
      `${cmd} node-info googleSheets`,
      `\`\`\``,
      `- Get **EXACT parameter names** (e.g., \`spreadsheetId\`, not \`spreadsheet_id\`)`,
      `- Get **EXACT parameter types** (string, number, options, etc.)`,
      `- Get **available operations/resources**`,
      `- Get **required vs optional parameters**`,
      ``,
      `### Step 3: Apply Schema as Absolute Truth`,
      `- **CRITICAL (TYPE)**: The \`type\` field MUST EXACTLY match the \`type\` from schema`,
      `- **CRITICAL (VERSION)**: Use HIGHEST \`typeVersion\` from schema`,
      `- **PARAMETER NAMES**: Use exact names (e.g., \`spreadsheetId\` vs \`spreadsheet_id\`)`,
      `- **NO HALLUCINATIONS**: Do not invent parameter names`,
      ``,
      `### Step 4: Validate Before Finishing`,
      `\`\`\`bash`,
      `${cmd} validate workflow.workflow.ts`,
      `\`\`\``,
      ``,
      `### Step 5: Verify After Push`,
      `\`\`\`bash`,
      `${cliCmd} verify <workflowId>`,
      `\`\`\``,
      `- **Catches runtime errors** that local validate misses: non-existent typeVersion, invalid operation values, missing required params.`,
      `- Tip: use \`${cliCmd} push my-workflow.workflow.ts --verify\` to do both in one command.`,
      ``,
      `### Step 6: Inspect Webhook/Chat/Form Testability After Push`,
      `\`\`\`bash`,
      `${cliCmd} test-plan <workflowId>`,
      `${cliCmd} test-plan <workflowId> --json`,
      `\`\`\``,
      `- Determines whether the workflow is HTTP-testable.`,
      `- Returns the trigger type, endpoints, and a suggested payload inferred from expressions.`,
      `- The suggested payload is heuristic. Review it before relying on it.`,
      ``,
      `### Step 7: Test Webhook/Chat/Form Workflows After Push`,
      `\`\`\`bash`,
      `${cliCmd} test <workflowId>`,
      `\`\`\``,
      `- **Closes the dev cycle** for HTTP-triggered workflows.`,
      `- **Class A exit 0** — config gap (credentials, model, env var): inform user, do NOT re-edit code.`,
      `- **Class B exit 1** — wiring error (bad expression, wrong field): fix, push, re-test.`,
      `- Skip this step for Schedule/polling triggers — they cannot be called via HTTP.`,
      ``,
      `---`,
      ``,
      ...this.getWorkflowMapGuidanceLines(),
      `---`,
      ``,
      `## 📝 Minimal Workflow Structure`,
      ``,
      `\`\`\`typescript`,
      `import { workflow, node, links } from '@n8n-as-code/transformer';`,
      ``,
      `@workflow({`,
      `  name: 'Workflow Name',`,
      `  active: false`,
      `})`,
      `export class MyWorkflow {`,
      `  @node({`,
      `    name: 'Descriptive Name',`,
      `    type: '/* EXACT from search */',`,
      `    version: 4,`,
      `    position: [250, 300]`,
      `  })`,
      `  MyNode = {`,
      `    /* parameters from npx --yes n8nac skills node-info */`,
      `  };`,
      ``,
      `  @node({`,
      `    name: 'Next Node',`,
      `    type: '/* EXACT from search */',`,
      `    version: 3`,
      `  })`,
      `  NextNode = { /* parameters */ };`,
      ``,
      `  @links()`,
      `  defineRouting() {`,
      `    this.MyNode.out(0).to(this.NextNode.in(0));`,
      `  }`,
      `}`,
      `\`\`\``,
      ``,
      `### AI Agent Workflow Example (CRITICAL — follow this pattern for LangChain nodes)`,
      ``,
      `\`\`\`typescript`,
      ...this.getAiAgentWorkflowExampleCode().split('\n'),
      `\`\`\``,
      ``,
      `> **Key rule**: Regular nodes connect with \`source.out(0).to(target.in(0))\`. AI sub-nodes (models, memory, tools, parsers, embeddings, vector stores, retrievers) MUST connect with \`.uses()\`. Using \`.out().to()\` for AI sub-nodes will produce broken connections.`,
      ``,
      `---`,
      ``,
      `## 🚫 Common Mistakes to AVOID`,
      ``,
      `1. ❌ **Wrong node type** - Missing package prefix causes "?" icon. Always use the EXACT \`type\` from \`node-schema\` (with full package prefix: \`n8n-nodes-base.switch\`, not \`switch\`).`,
      `2. ❌ **Outdated typeVersion** - Use highest version from schema`,
      `3. ❌ **Non-existent typeVersion** - e.g. \`typeVersion: 1.6\` when schema only has \`[1, 1.1, 2, 2.2]\`. Causes "Could not find workflow" in n8n. Always pick a value **from the exact array in \`node-schema\`**.`,
      `4. ❌ **Invalid operation/resource value** - e.g. \`operation: 'post'\` on Slack node when the valid string for that resource is \`'create'\`. n8n will show "Could not find property option". Always verify the exact string appears in the \`options[].value\` list returned by \`${cmd} node-schema <node>\`.`,
      `5. ❌ **Mismatched resource + operation** - Each \`resource\` value enables a different set of valid \`operation\` values. Combining an operation from the wrong resource causes "Could not find property option" in n8n.`,
      `6. ❌ **Guessing parameter structure** - Check if nested objects required`,
      `7. ❌ **Wrong connection names** - Must match EXACT node \`name\` field`,
      `8. ❌ **Inventing non-existent nodes** - Use \`search\` to verify`,
      `9. ❌ **Wrong \`.uses()\` syntax for tools** - \`ai_tool\` and \`ai_document\` are ALWAYS arrays: \`ai_tool: [this.Tool.output]\`. All other AI connection types (\`ai_languageModel\`, \`ai_memory\`, etc.) are single refs: \`ai_languageModel: this.Model.output\`. Never wrap single refs in an array.`,
      `10. ❌ **Connecting AI sub-nodes with \`.out().to()\`** — any node flagged \`[ai_*]\` in the NODE INDEX MUST use \`.uses()\`, never \`.out().to()\`. Doing so produces invisible/broken connections in n8n.`,
      `11. ❌ **Guessing fixedCollection values without checking** — Fields like \`rules\` (Switch/If) or \`formFields\` (Wait) expand into nested structures with specific valid option values. Always run \`node-info <node>\` first — the schema now shows the full internal structure and all valid values. Never invent operation names like \`'contained'\`.`,
      `12. ❌ **Inverting \`value1\`/\`value2\` in Switch/If rules** — \`value1\` is ALWAYS the expression being evaluated (e.g. \`={{ $json.myField }}\`). \`value2\` is ALWAYS the literal comparison value (e.g. \`'auto_send_ok'\`). Swapping them causes rules to never match.`,
      `13. ❌ **Wrong \`formFields\` structure for Wait (form) nodes** — \`formFields\` must use \`{ values: [...] }\` (flat array). Do NOT use \`formFieldsUi.fieldItems\` — that legacy structure causes "Could not find property option" in n8n.`,
      ``,
      `---`,
      ``,
      `## ✅ Best Practices`,
      ``,
      `### Node Parameters`,
      `- ✅ Always check schema before writing`,
      `- ✅ Use exact parameter names from schema`,
      `- ❌ Never guess parameter names`,
      ``,
      `### Expressions (Modern Syntax)`,
      `- ✅ Use: \`{{ $json.fieldName }}\` (modern)`,
      `- ✅ Use: \`{{ $('NodeName').item.json.field }}\` (specific nodes)`,
      `- ❌ Avoid: \`{{ $node["Name"].json.field }}\` (legacy)`,
      ``,
      `### Node Naming`,
      `- ✅ "Action Resource" pattern (e.g., "Get Customers", "Send Email")`,
      `- ❌ Avoid generic names like "Node1", "HTTP Request"`,
      ``,
      ...this.getSharedToolGuidanceLines(cmd),
      `---`,
      ``,
      `## 📚 Available Tools`,
      ``,
      ``,
      `### 🔍 Unified Search (PRIMARY TOOL)`,
      `\`\`\`bash`,
      `${cmd} search "google sheets"`,
      `${cmd} search "how to use RAG"`,
      `\`\`\``,
      `**ALWAYS START HERE.** Deep search across nodes, docs, and tutorials.`,
      ``,
      `### 🛠️ Get Node Schema`,
      `\`\`\`bash`,
      `${cmd} node-info googleSheets  # Complete info`,
      `${cmd} node-schema googleSheets  # Quick reference`,
      `\`\`\``,
      ``,
      `### 🌐 Community Workflows`,
      `\`\`\`bash`,
      `${cmd} examples search "slack notification"`,
      `${cmd} examples info 916`,
      `${cmd} examples download 4365`,
      `\`\`\``,
      ``,
      `### 📖 Documentation`,
      `\`\`\`bash`,
      `${cmd} docs "OpenAI"`,
      `${cmd} guides "webhook"`,
      `\`\`\``,
      ``,
      `### ✅ Validate`,
      `\`\`\`bash`,
      `${cmd} validate workflow.workflow.ts`,
      `\`\`\``,
      ``,
      `### 🔎 Verify Live Workflow (post-push)`,
      `\`\`\`bash`,
      `${cliCmd} verify <workflowId>          # Fetch from n8n + validate against schema`,
      `${cliCmd} push my-workflow.workflow.ts --verify   # Push then verify in one step`,
      `\`\`\``,
      `Catches runtime errors (invalid typeVersion, bad operation values, missing required params) **before** the user notices them in the UI.`,
      ``,
      `### 🧭 Inspect Webhook/Chat/Form Test Plan (post-push)`,
      `\`\`\`bash`,
      `${cliCmd} test-plan <workflowId>         # Detect trigger + testability + suggested payload`,
      `${cliCmd} test-plan <workflowId> --json  # Structured output for agents`,
      `\`\`\``,
      `Use this first when an agent needs to know whether a workflow can be tested and what payload to try.`,
      ``,
      `### 🧪 Test Webhook/Chat/Form Workflows (post-push)`,
      `\`\`\`bash`,
      `${cliCmd} test <workflowId>              # Trigger test-mode URL, show result`,
      `${cliCmd} test <workflowId> --data '{"key":"value"}'  # Pass request body`,
      `${cliCmd} test <workflowId> --prod       # Use production URL instead`,
      `\`\`\``,
      `Closes the dev cycle for webhook/chat/form workflows. Exits 0 on success or Class A (config gap — inform user). Exits 1 on Class B (wiring error — fix and re-test). Prefer \`${cliCmd} test-plan\` first when the payload is unclear.`,
      ``,
      `### 🔑 Credential Management (resolve Class A gaps without opening the n8n UI)`,
      `\`\`\`bash`,
      `${cliCmd} workflow credential-required <id> --json            # List missing credentials (exit 1 if any missing)`,
      `${cliCmd} credential schema <type>                            # Discover required fields for a type`,
      `${cliCmd} credential list                                     # List existing credentials`,
      `${cliCmd} credential create --type <type> --name <name> --file cred.json  # Create from file`,
      `${cliCmd} credential delete <id>                              # Delete a credential`,
      `${cliCmd} workflow activate <id>                              # Activate workflow after credentials provisioned`,
      `\`\`\``,
      `**Full autonomous loop:** push workflow → \`workflow credential-required <id> --json\` (exit 1 = missing, act) → \`credential schema <type>\` → ask user for secret values → \`credential create --file\` → \`workflow activate <id>\` → \`test <id>\`. Workflow blocked by a Class A error? Use \`credential schema <type>\` to discover required fields, write them to a JSON file, then run \`credential create\` to provision the credential programmatically. **Never pass secrets inline via --data** — use --file instead (keeps secrets out of shell history).`,
      ``,
      `---`,
      ``,
      `> **When in doubt**: \`${cmd} node-info <nodeName>\` — the schema is always the source of truth.`
    ].join('\n');
  }

  getSkillContent(): string {
    const { cliCmd, skillsCmd } = this.getCommandRefs();
    return `---
name: n8n-architect
description: Expert assistant for n8n workflow development. Use when the user asks about n8n workflows, nodes, automation, or needs help creating/editing n8n JSON configurations. Provides access to complete n8n node documentation and prevents parameter hallucination.
---

# n8n Architect

You are an expert n8n workflow engineer. Your role is to help users create, edit, and understand n8n workflows using clean, version-controlled TypeScript files.

## 🌍 Context

- **Workflow Format**: TypeScript files using \`@workflow\`, \`@node\`, \`@links\` decorators
- **Tool Access**: You have access to the complete n8n node documentation via CLI commands

${this.getWorkspaceBootstrapLines(cliCmd).join('\n')}

## 📘 Root Agent Context

- After initialization is complete, read \`AGENTS.md\` from the workspace root.
- \`init\` or the completed \`init-project\` flow automatically bootstraps \`AGENTS.md\` via \`n8nac update-ai\`.
- Treat \`AGENTS.md\` as shared workspace context that complements this skill. Use it after initialization, not before.

## 🔄 Sync Discipline (MANDATORY)

This project uses a **Git-like explicit sync model**. You are responsible for pulling before reading and pushing after writing.

### Before modifying a workflow

Always pull the latest version from the n8n instance first:

\`\`\`
n8n.pullWorkflow  →  right-click the workflow in the sidebar, or run the "Pull Workflow" command
\`\`\`

This ensures your local file matches the remote state before you make any changes. Skipping this step risks overwriting someone else's changes or triggering an OCC conflict.

### After modifying a workflow

Always push your changes back to the n8n instance:

\`\`\`
n8n.pushWorkflow  →  right-click the workflow in the sidebar, or run the "Push Workflow" command
\`\`\`

If the push fails with an OCC conflict (the remote was modified since your last pull), you will be offered:
- **Show Diff** — inspect what changed remotely
- **Force Push** — overwrite the remote with your version
- **Pull** — discard your changes and take the remote version

### Rules

1. **Pull before you read or modify** — never assume local files are up to date
2. **Push after every modification** — never leave local changes unpushed
3. **Never modify \`.workflow.ts\` files without a preceding pull** — treat it like \`git pull\` before editing
4. **One workflow at a time** — pull/push operates on the currently open workflow file

## 🔬 Research Protocol (MANDATORY)

**NEVER hallucinate or guess node parameters.** Always follow this protocol:

### Step 1: Search for the Node

When a user mentions a node type (e.g., "HTTP Request", "Google Sheets", "Code"), first search for it:

\`\`\`bash
npx --yes n8nac skills search "<search term>"
\`\`\`

**Examples:**
- \`npx --yes n8nac skills search "http request"\`
- \`npx --yes n8nac skills search "google sheets"\`
- \`npx --yes n8nac skills search "webhook"\`

This returns a list of matching nodes with their exact technical names.

### Step 2: Get the Node Schema

Once you have the exact node name, retrieve its complete schema:

\`\`\`bash
npx --yes n8nac skills node-info "<nodeName>"
\`\`\`

**Examples:**
- \`npx --yes n8nac skills node-info "httpRequest"\`
- \`npx --yes n8nac skills node-info "googleSheets"\`
- \`npx --yes n8nac skills node-info "code"\`

This returns the full JSON schema including all parameters, types, defaults, valid options, and input/output structure.

### Step 3: Apply the Knowledge

Use the retrieved schema as the **absolute source of truth** when generating or modifying workflow TypeScript. Never add parameters that aren't in the schema.

${this.getWorkflowMapGuidanceLines().join('\n')}

## 🛠 Coding Standards

### TypeScript Decorator Format

\`\`\`typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
  name: 'Workflow Name',
  active: false
})
export class MyWorkflow {
  @node({
    name: 'Descriptive Name',
    type: '/* EXACT from search */',
    version: 4,
    position: [250, 300]
  })
  MyNode = {
    /* parameters from npx --yes n8nac skills node-info */
  };

  @links()
  defineRouting() {
    this.MyNode.out(0).to(this.NextNode.in(0));
  }
}
\`\`\`

### AI Agent Workflow Example

\`\`\`typescript
${this.getAiAgentWorkflowExampleCode()}
\`\`\`

> **Key rule**: Regular nodes connect with \`source.out(0).to(target.in(0))\`. AI sub-nodes (models, memory, tools, parsers, embeddings, vector stores, retrievers) MUST connect with \`.uses()\`. Using \`.out().to()\` for AI sub-nodes will produce broken connections.

### Expression Syntax

**Modern (Preferred):**
\`\`\`javascript
{{ $json.fieldName }}
{{ $json.nested.field }}
{{ $now }}
{{ $workflow.id }}
\`\`\`

### Credentials

**NEVER hardcode API keys or secrets.** Always reference credentials by name.

### Connections

- ✅ Regular: \`this.NodeA.out(0).to(this.NodeB.in(0))\`
- ✅ AI sub-nodes: \`this.Agent.uses({ ai_languageModel: this.Model.output })\`
- ❌ Never use \`.out().to()\` for AI sub-node connections

${this.getSharedToolGuidanceLines(skillsCmd).join('\n')}

## 🚀 Best Practices

1. **Always verify node schemas** before generating configuration
2. **Use descriptive node names** for clarity ("Get Customers", not "HTTP Request")
3. **Add comments in Code nodes** to explain logic
4. **Validate node parameters** using \`npx --yes n8nac skills node-info <nodeName>\`
5. **Reference credentials** by name, never hardcode
6. **Use error handling** nodes for production workflows

## 🔍 Troubleshooting

If you're unsure about any node:

1. **List all available nodes:**
   \`\`\`bash
   npx --yes n8nac skills list
   \`\`\`

2. **Search for similar nodes:**
   \`\`\`bash
   npx --yes n8nac skills search "keyword"
   \`\`\`

3. **Get detailed documentation:**
   \`\`\`bash
   npx --yes n8nac skills node-info "nodeName"
   \`\`\`

## 🔑 Credential Management

When a workflow is blocked because a credential is missing, resolve it without opening the n8n UI:

**Full autonomous loop:**

1. **Detect missing credentials for a workflow (exit 1 = act, exit 0 = all present):**
   \`\`\`bash
   npx --yes n8nac workflow credential-required <workflowId> --json
   \`\`\`
   Output: `[{ nodeName, credentialType, credentialName, exists }]`  
   Run this immediately after pushing. Exit code 1 means at least one credential is missing.

2. **Discover required fields for a credential type:**
   \`\`\`bash
   npx --yes n8nac credential schema <type>
   \`\`\`
   Example: \`npx --yes n8nac credential schema notionApi\`  
   Use the output to build the credential data file. Ask the user for secret values — never guess.

3. **Create the credential from a file (preferred — keeps secrets out of shell history):**
   \`\`\`bash
   npx --yes n8nac credential create --type <type> --name "My Credential" --file cred.json
   \`\`\`

4. **Activate the workflow after credentials are provisioned:**
   \`\`\`bash
   npx --yes n8nac workflow activate <workflowId>
   \`\`\`

5. **Run the test:**
   \`\`\`bash
   npx --yes n8nac test <workflowId>
   \`\`\`
   A Class A error that was blocking the test should now be resolved.

**Other credential commands:**
   \`\`\`bash
   npx --yes n8nac credential list                      # List all existing credentials
   npx --yes n8nac workflow deactivate <workflowId>     # Deactivate a workflow
   \`\`\`

${this.getSharedResponseFormatLines(cliCmd).join('\n')}
`;
  }

  /**
   * Builds the OpenClaw-specific n8n skill prompt.
   * Unlike getSkillContent(), this variant emphasizes the native `n8nac` tool
   * and the lighter OpenClaw prompt/skill handoff to workspace AGENTS.md.
   */
  getOpenClawSkillContent(): string {
    const { skillsCmd } = this.getCommandRefs();
    const workflowMapLines = this.getWorkflowMapGuidanceLines()
      .map((line) => line === '## 🗺️ Reading Workflow Files Efficiently'
        ? '## Reading workflow files efficiently'
        : line);
    const toolGuidanceLines = this.getSharedToolGuidanceLines(skillsCmd)
      .map((line) => line === '### AI Tool Nodes'
        ? '### AI tool nodes'
        : line);
    return `---
name: n8n-architect
description: Use when the user explicitly wants to create, edit, validate, sync, or troubleshoot n8n workflows, asks about n8n nodes or automation, or wants to use the n8nac tool.
---

# n8n Architect

Use this skill only for explicit n8n workflow work.

## First steps

1. Check whether \`n8nac-config.json\` exists in the workspace root.
2. If the workspace is initialized, read \`AGENTS.md\` from the workspace root before making workflow changes. It is the detailed, workspace-specific source of truth generated by \`n8nac update-ai\`.
3. If \`AGENTS.md\` is missing or unreadable, regenerate it with \`npx --yes n8nac update-ai\` or run the \`openclaw n8nac:setup\` command before attempting workflow authoring.
4. If the workspace is not initialized, ask the user for the n8n host URL and API key, then use the \`n8nac\` tool with \`action: "init_auth"\` and \`action: "init_project"\` to complete setup yourself.

## Using the n8nac tool

- Use the \`n8nac\` tool for setup checks, workflow list/pull/push/verify, validation, and \`skills\` lookups.
- Use \`action: "skills"\` whenever you need node search or schema details.
- Never guess node parameters. The schema lookup is the source of truth.
- Treat \`AGENTS.md\` as the authoritative workflow-engineering protocol once this skill is active.
- When a workflow fails due to missing credentials (Class A), run \`action: "workflow_credential_required"\` first to identify all missing credentials, then \`action: "credential_schema"\` to discover required fields (ask the user for secret values — never guess), then \`action: "credential_create"\` to provision the credential programmatically, then \`action: "workflow_activate"\` to activate the workflow before re-running the test.

${workflowMapLines.join('\n')}

${toolGuidanceLines.join('\n')}
`;
  }

}
