import test from 'node:test';
import assert from 'node:assert';

test('Agent Workbench HTML: workflow reload forces iframe navigation', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/__n8n-manager/open-workflow/wf-1',
        workflowReloadUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes("message.type === 'workflow.reload'"), 'Must listen for workflow reload messages');
    assert.ok(html.includes('http://localhost:5678/workflow/wf-1'), 'Reload must use the final n8n workflow URL');
    assert.ok(html.includes('_n8nacRefresh'), 'Reload must add a cache-busting query param');
    assert.ok(html.includes('frame.src = reloadUrl.toString()'), 'Reload must assign a fresh iframe URL');
});

test('Agent Workbench HTML: forwards node detail context to the agent', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowFilename: 'Workflow 1.workflow.ts',
        workflowFilePath: '/workspace/workflows/dev3/Workflow 1.workflow.ts',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('id="context-badges"'), 'Must render the context badge container');
    assert.ok(html.includes("message.type === 'n8n-node-context-cleared'"), 'Must clear node context from iframe events');
    assert.ok(html.includes('isWorkflowFrameEvent'), 'Must validate iframe-originated node context messages');
    assert.ok(html.includes("message.type === 'n8n-node-detail-opened'"), 'Must handle node detail messages from iframe');
    assert.ok(html.includes("type: 'agent.nodeDetailChanged'"), 'Must forward node context to extension host');
    assert.ok(html.includes('nodeContexts: currentNodeContexts'), 'Must include node contexts when sending prompts');
});

test('Agent Workbench HTML: renders provider/session controls', () => {
    const { AGENT_WORKBENCH_BUILD, buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('id="select-model"'), 'Must render provider/model button in the chat header');
    assert.ok(html.includes('id="select-reasoning"'), 'Must render reasoning effort button');
    assert.ok(html.includes('id="history-open"'), 'Must render the conversation history button');
    assert.ok(html.includes('id="session-list"'), 'Must render the persisted session list in history modal');
    assert.ok(html.includes("type: 'agent.session.new'"), 'Must allow creating new persisted sessions');
    assert.ok(html.includes("type: 'agent.session.delete'"), 'Must allow deleting persisted sessions from history');
    assert.ok(html.includes("className = 'ghost session-delete'"), 'Must render a trash icon button for each persisted session');
    assert.ok(!html.includes("window.confirm('Delete this conversation? This cannot be undone.')"), 'Conversation delete confirmation must be handled by the extension host');
    assert.ok(html.includes('id="new-session-menu"'), 'Must render new conversation context picker');
    assert.ok(html.includes('This workflow'), 'Must allow a new chat for the current workflow');
    assert.ok(html.includes('New workflow'), 'Must allow a new unattached workflow chat');
    assert.ok(html.includes('state.availableWorkflows'), 'Must list available workflows in the new chat picker');
    assert.ok(html.includes('availableWorkflowCache'), 'Must keep the new conversation workflow menu stable while runtime state is lightweight');
    assert.ok(html.includes('const menuWorkflowContext = currentWorkflowContext || openWorkflowContext'), 'Must show the currently open workflow while a run is active');
    assert.ok(html.includes('workflowFilename'), 'Must preserve the open workflow filename in the client fallback context');
    assert.ok(html.includes('workflowFilePath'), 'Must preserve the open workflow file path in the client fallback context');
    assert.ok(html.includes('startNewSession(null)'), 'Must request an unattached session for new workflow');
    assert.ok(!html.includes('blank.disabled = isRunning'), 'Parallel chats must allow starting a new session while a run is active');
    assert.ok(!html.includes('function startNewSession(workflow) {\n            if (isRunning) return;'), 'Parallel chats must not guard new-session creation on the current run state');
    assert.ok(html.includes('history-overlay'), 'Must render conversation history as a modal overlay');
    assert.ok(html.includes("type: 'agent.ready'"), 'Must request initial state from the extension host');
    assert.ok(html.includes('openai / gpt-5.4'), 'Must render selected provider/model label');
    assert.ok(html.includes(AGENT_WORKBENCH_BUILD), 'Must render a visible Workbench build stamp');
    assert.ok(!html.includes('Agent workbench is ready. Ask for a workflow inspection'), 'Must remove initial system message');
});

test('Agent Workbench HTML: Enter submits and Shift+Enter keeps multiline input', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes("event.key === 'Enter' && !event.shiftKey"), 'Must submit on Enter unless Shift is held');
    assert.ok(html.includes('event.preventDefault()'), 'Must prevent textarea newline insertion on submit');
    assert.ok(html.includes('sendPrompt();'), 'Must submit the composer from the Enter key handler');
});

test('Agent Workbench HTML: stop is icon-only and updates optimistically', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('<rect width="10" height="10" x="7" y="7" rx="1.5"/>'), 'Must render a stop icon');
    assert.ok(html.includes('aria-label="Stop"'), 'Must expose an accessible stop label');
    assert.ok(!html.includes('>Stop</button>'), 'Must not render stop as text');
    assert.ok(html.includes('function stopRunOptimistically()'), 'Must render the stopped notice before host confirmation');
    assert.ok(html.includes("text: 'Run stopped.'"), 'Must add the stopped notice optimistically');
    assert.ok(html.includes('setRunning(false);'), 'Must update stop UI before host confirmation');
    assert.ok(html.includes("vscode.postMessage({ type: 'agent.stop' });"), 'Must still request runtime stop');
});

test('Agent Workbench HTML: final stream event releases composer while runtime can finish', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes("event.type === 'final'"), 'Must handle the final stream event');
    assert.ok(html.includes('runtimeFinalizing = Boolean(event.runtimeFinalizing);'), 'Must remember when DeepAgents is still finalizing after the visible answer');
    assert.ok(html.includes('Finalizing context before the next run...'), 'Must explain when the native runtime is finalizing after the visible answer');
    assert.ok(html.includes('setRunning(false);'), 'Must unlock the composer as soon as the final response arrives');
    assert.ok(html.includes('if (isRunning || runtimeFinalizing)'), 'Must queue immediate follow-up prompts while the native runtime context finalizes');
    assert.ok(html.includes("if (message.status === 'idle') runtimeFinalizing = false;"), 'Must clear runtime finalization once the host posts idle');
    assert.ok(html.includes('return isRunning || runtimeFinalizing || hasLiveEntry;'), 'Must reject stale runtime states that would remove the visible final answer while DeepAgents finalizes');
});

test('Agent Workbench HTML: stop releases inline message actions immediately', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes("function stopRunOptimistically()"), 'Must handle stop optimistically');
    assert.ok(html.includes("state.session.entries = entries;\n            pendingPrompt = null;\n            renderPendingPrompt();\n            setRunning(false);"), 'Must re-render inline actions as enabled during optimistic stop');
    assert.ok(!html.includes("stopRunOptimistically();\n            setRunning(false);"), 'Stop click should not rely on a second delayed running-state update');
});

test('Agent runtime: final response does not wait for post-run checkpoint work', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    assert.ok(source.includes("await postMessage({ type: 'agent.status', status: 'idle' });\n                postedIdle = true;"), 'Must post idle before slower state refresh work on normal completion');
    assert.ok(source.includes('saveAutoCheckpointAfterFileModificationInBackground'), 'Must keep auto-checkpoints off the response critical path');
    assert.ok(!source.includes('await this.saveAutoCheckpointAfterFileModification(service, input, entries);'), 'Must not await auto-checkpoint after emitting the final response');
});

test('Agent runtime: workbench uses the native DeepAgents v3 run stream', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    assert.ok(source.includes("streamEvents({ messages }, { ...config, version: 'v3' })"), 'Workbench runs must use the DeepAgents v3 run stream');
    assert.ok(source.includes('consumeDeepAgentV3Run(run, input, entries, sessions.service, postMessage, signal, contextWindowTokens)'), 'Must consume the native v3 run stream directly');
    assert.ok(source.includes('Promise.resolve(run.output)'), 'Must use native run.output for authoritative completion');
    assert.ok(source.includes('consumeDeepAgentV3MessageProjection'), 'Must adapt native v3 message projections for UI streaming');
    assert.ok(source.includes('consumeDeepAgentV3ToolCallProjection'), 'Must adapt native v3 tool-call projections for UI operations');
    assert.ok(source.includes('run.messages'), 'Must read the native run.messages projection');
    assert.ok(source.includes('run.toolCalls'), 'Must read the native run.toolCalls projection');
    assert.ok(source.includes('message.text'), 'Must read the native message.text projection');
    assert.ok(source.includes('message.reasoning'), 'Must read the native message.reasoning projection');
    assert.ok(source.includes('message.usage'), 'Must read the native message.usage projection');
    assert.ok(source.includes("eventName === 'content-block-finish'"), 'Must use native message lifecycle events to detect visible text completion');
    assert.ok(source.includes('extractContentBlockText(content)'), 'Must finalize visible answers from the completed text block');
    assert.ok(source.includes('onFinalCandidate'), 'Must emit a visible final response from native message projections');
    assert.ok(source.includes('runtimeFinalizing'), 'Must distinguish visible completion from authoritative run.output completion');
    assert.ok(source.includes('deepagents.v3.visible-final'), 'Must log when the visible answer is complete');
    assert.ok(source.includes('deepagents.v3.run.output resolved'), 'Must log when the authoritative run output resolves');
    assert.ok(source.includes('visibleDone'), 'Must let follow-up prompts queue once the visible answer is complete');

    const forbiddenLegacyStreamMarkers = [
        "version: 'v2'",
        'version: "v2"',
        'consumeDeepAgentV2Stream',
        'processDeepAgentStreamEvent',
        'processDeepAgentV3MessageProjectionEvent',
        'extractStreamDeltas',
        'emitContextUsageFromChunk',
        'getStreamOperationId',
        'on_chat_model_stream',
        'on_chat_model_end',
        'on_tool_start',
        'on_tool_end',
        'stream=v2',
        'linear DeepAgents event stream',
        'resolveWithTimeout',
        'waitForDeepAgentV3Sidecars',
    ];
    for (const marker of forbiddenLegacyStreamMarkers) {
        assert.ok(!source.includes(marker), `Workbench runtime must not contain legacy DeepAgents stream marker: ${marker}`);
    }
});

test('Agent runtime: Codex v3 output adapter reads provider output items', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    assert.ok(source.includes('extractProviderOutputItemsText'), 'Must read provider-specific output metadata when native final content is empty');
    assert.ok(source.includes('codex_output_items'), 'Must handle Codex raw Responses output stored by the local Codex provider runtime');
    assert.ok(source.includes('rawOutputItems'), 'Must handle raw output item metadata from the Codex provider runtime');
    assert.ok(source.includes('lastProviderTextChars'), 'Debug logs must make provider-output text extraction visible');
    assert.ok(source.includes("type === 'output_text'"), 'Must extract text from Responses API output_text blocks');
});

test('Agent runtime: Codex stream keeps parallel tool calls separated', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-provider-runtime/chat-codex-oauth.ts'), 'utf8');

    assert.ok(source.includes('toolCallIndexes = new Map'), 'Codex tool-call indexes must be stable per tool call id');
    assert.ok(source.includes('index: index') || source.includes('index,'), 'Native LangChain tool-call chunks must receive distinct indexes');
    assert.ok(source.includes('additional_kwargs'), 'Provider additional_kwargs tool calls must receive matching indexes');
    assert.ok(source.includes('createOpenAiAccountLanguageModel'), 'The index mapping must live inside the local Codex LangChain model');
});

test('Agent runtime: agent provider runtime dependency is removed', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const controller = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');
    const providerService = fs.readFileSync(path.join(__dirname, '../../src/services/agent-provider-service.ts'), 'utf8');
    const localFactory = fs.readFileSync(path.join(__dirname, '../../src/services/agent-provider-runtime/create-langchain-model.ts'), 'utf8');
    const packageJson = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
    const removedRuntimePackage = `@${String.fromCharCode(121, 97, 103, 114)}/provider-runtime`;
    const removedServiceName = `${String.fromCharCode(121, 97, 103, 114)}-provider-service`;

    assert.ok(!controller.includes(removedRuntimePackage), 'Agent runtime must not import the external agent provider runtime');
    assert.ok(!providerService.includes(removedRuntimePackage), 'Provider service must not import the external agent provider runtime');
    assert.ok(!packageJson.includes(removedRuntimePackage), 'Extension package must not depend on the external agent provider runtime');
    assert.ok(!controller.includes(removedServiceName), 'Agent runtime imports must use the renamed provider service');
    assert.ok(localFactory.includes("case 'minimax'"), 'MiniMax must be handled by the local provider factory');
    assert.ok(localFactory.includes('ChatAnthropic'), 'MiniMax M2 Anthropic-compatible endpoint should use the standard LangChain Anthropic model');
    assert.ok(localFactory.includes('anthropicApiUrl'), 'MiniMax must use LangChain standard Anthropic-compatible base URL support');
    assert.ok(!packageJson.includes('@langchain/community'), 'Do not add the old ChatMinimax integration for the Anthropic-compatible MiniMax path');
});

test('Agent runtime: invalid tool-call recovery stays hidden from the Workbench', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    assert.ok(source.includes('isInternalRecoveryText'), 'Must identify internal recovery prompts');
    assert.ok(source.includes('pendingVisibleText.startsWith(INVALID_TOOL_CALL_RECOVERY_MARKER)'), 'Event projection must suppress recovery prompts before rendering');
    assert.ok(source.includes('pendingText.startsWith(INVALID_TOOL_CALL_RECOVERY_MARKER)'), 'Message text projection must suppress recovery prompts before rendering');
    assert.ok(source.includes('if (this.isInternalRecoveryText(value)) return'), 'Sanitization must never return internal recovery text as an assistant answer');
});

test('Agent runtime: LangGraph checkpoints are sharded by thread', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    assert.ok(source.includes("'langgraph-checkpoints-sharded'"), 'Runtime checkpoints must be stored in the sharded directory');
    assert.ok(source.includes('flushThread(threadId'), 'Checkpoint writes must flush only the active thread shard');
    assert.ok(source.includes('version: 2'), 'Shard payloads must use the v2 checkpoint storage format');
    assert.ok(source.includes('allowLegacy: Boolean(checkpointId)'), 'Legacy monolith migration should only happen for explicit checkpoint restores');
    assert.ok(!source.includes('storage: this.storage,\n                                writes: this.writes'), 'Checkpoint writes must not rewrite one global monolithic JSON file');
});

test('Agent Workbench state delivery: runtime states are lightweight and ordered', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/ui/agent-workbench-webview.ts'), 'utf8');

    assert.ok(source.includes('private _stateSequence = 0;'), 'Must version Workbench state messages');
    assert.ok(source.includes("await this._panel.webview.postMessage({ type: 'agent.state', state: nextState, stateSequence });"), 'Must send critical runtime state before enrichment');
    assert.ok(source.includes('if (!nextState.isRunning)'), 'Must not enrich stale runtime snapshots while a run is active');
    assert.ok(source.includes("void this.postWorkbenchState(undefined, { enrich: true })"), 'Must refresh state before background enrichment instead of reusing a stale snapshot');
    assert.ok(source.includes('await this.postWorkbenchState(message.state, { enrich: false });'), 'Runtime state messages should use the lightweight path');
});

test('Agent Workbench webview: conversation deletion is confirmed and cleans panel ownership', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/ui/agent-workbench-webview.ts'), 'utf8');

    assert.ok(source.includes("payload.type === 'agent.session.delete'"), 'Must handle session deletion messages');
    assert.ok(source.includes('vscode.window.showWarningMessage('), 'Session deletion must use a VS Code host confirmation dialog');
    assert.ok(source.includes("confirmed !== 'Delete'"), 'Session deletion must be cancellable');
    assert.ok(source.includes('AgentWorkbenchWebview._panels.delete(sessionId)'), 'Deleting a session must clear stale panel ownership');
    assert.ok(source.includes('deletedPanel.dispose()'), 'Deleting a session from another panel must close that stale panel');
});

test('Agent Workbench webview: workflow menu options preserve local file paths', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/ui/agent-workbench-webview.ts'), 'utf8');

    assert.ok(source.includes('resolveWorkflow(base)'), 'Available workflows should resolve their local file targets');
    assert.ok(source.includes('filePath: target?.workflowFilePath'), 'Available workflow options must include local file paths');
    assert.ok(source.includes('workflowFilename: this._workflow?.filename'), 'Initial HTML must receive the current workflow filename');
    assert.ok(source.includes('workflowFilePath: this._workflowFilePath'), 'Initial HTML must receive the current workflow file path');
    assert.ok(source.includes("workflowFilename: workflow?.filename || ''"), 'Workflow update messages must preserve filename');
    assert.ok(source.includes('workflowFilePath: workflowFilePath ||'), 'Workflow update messages must preserve file path');
});

test('Agent runtime: start state includes checkpointed user message', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/agent-runtime-controller.ts'), 'utf8');

    const stateIndex = source.indexOf("await postMessage({ type: 'agent.state', state: await this.getWorkbenchState({ ...input, sessionId: targetSessionId }) });");
    const startIndex = source.indexOf("await postMessage({ type: 'agent.streamEvent', event: { type: 'start', sessionId: targetSessionId, message: prompt } });");
    assert.ok(stateIndex >= 0, 'Must post the checkpointed user-message state before streaming starts');
    assert.ok(startIndex > stateIndex, 'The start event must follow the checkpointed state so rewind controls exist during a stopped run');
});

test('Agent Workbench HTML: user messages expose inline checkpoint rewind', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('function userMessageEntry(entry)'), 'Must render user messages through checkpoint-aware UI');
    assert.ok(html.includes("wrap.className = 'message-group user-message'"), 'Must place rewind controls below the message bubble');
    assert.ok(html.includes('justify-content: flex-end;'), 'Must align message action toolbar to the right');
    assert.ok(html.includes("actions.append(rewind, copy)"), 'Must render a compact two-action message toolbar');
    assert.ok(html.includes('rewindMessageOptimistically(entry)'), 'Must update the conversation immediately before runtime restore completes');
    assert.ok(html.includes("type: 'agent.message.rewind'"), 'Must request a rewind from a user message action');
    assert.ok(html.includes("message.type === 'agent.messageRewind'"), 'Must handle restored prompts from the extension host');
    assert.ok(html.includes('promptInput.focus()'), 'Must focus the composer after rewinding');
});

test('Agent Workbench HTML: stale state cannot undo a local rewind', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('const rewoundMessageIds = new Set();'), 'Must remember locally rewound messages');
    assert.ok(html.includes('rewoundMessageIds.add(entry.id);'), 'Must mark the target message before waiting for host confirmation');
    assert.ok(html.includes('function acceptIncomingStateMessage(message)'), 'Must gate incoming state messages');
    assert.ok(html.includes('if (incomingStateContainsRewoundMessage(message.state)) return false;'), 'Must ignore late states that contain rewound messages');
    assert.ok(html.includes('if (incomingStateDropsLiveEntries(message.state)) return false;'), 'Must ignore stale states that would erase live streamed content');
    assert.ok(html.includes('if (sequence && sequence < lastStateSequence) return false;'), 'Must ignore out-of-order state updates');
});

test('Agent Workbench HTML: assistant responses expose a copy action dock', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('function assistantMessageEntry(entry)'), 'Must render assistant responses through a message group');
    assert.ok(html.includes("wrap.className = 'message-group assistant-message'"), 'Must place assistant actions below the response');
    assert.ok(html.includes("copy.title = 'Copy response'"), 'Must expose copy as the initial assistant action');
    assert.ok(html.includes("if (!entry.streaming && entry.text)"), 'Must avoid action docks on still-streaming responses');
});

test('Agent Workbench HTML: context usage and compaction follow agent runtime contracts', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes('id="context-pill"'), 'Must render the context usage pill');
    assert.ok(html.includes('id="compact-context"'), 'Must render the manual compaction button');
    assert.ok(!html.includes('.context-actions {\n            display: none;'), 'Must not hide context actions globally');
    assert.ok(html.includes("if (!usage || usage.source !== 'api')"), 'Must hide context usage unless the source is api');
    assert.ok(html.includes("if (event.source !== 'api')"), 'Must ignore estimated stream usage events');
    assert.ok(html.includes('state.session.contextUsage = undefined'), 'Must reset context usage when a run starts');
    assert.ok(html.includes("entry.kind !== 'context-usage' && entry.kind !== 'workflow-context' && entry.kind !== 'node-context'"), 'Must hide only metadata entries from the feed');
    assert.ok(!html.includes("entry.kind !== 'compaction'"), 'Must keep compaction entries visible in the feed');
    assert.ok(html.includes('Context compacted with fallback'), 'Must label fallback compactions explicitly');
    assert.ok(html.includes("type: 'agent.context.compact'"), 'Must request runtime compaction from the extension host');
});

test('Agent Workbench HTML: handles panel.visibility to unload/reload iframe', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
        providerModelLabel: 'openai / gpt-5.4',
    });

    assert.ok(html.includes("message.type === 'panel.visibility'"), 'Must handle panel.visibility messages');
    assert.ok(html.includes("frame.src = 'about:blank'"), 'Must set frame.src to about:blank when hidden');
    assert.ok(html.includes("frame.src = workflowUrl"), 'Must restore original workflowUrl when visible');
});
