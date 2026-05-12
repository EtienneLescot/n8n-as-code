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
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
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
    assert.ok(html.includes('id="new-session-menu"'), 'Must render new conversation context picker');
    assert.ok(html.includes('This workflow'), 'Must allow a new chat for the current workflow');
    assert.ok(html.includes('New workflow'), 'Must allow a new unattached workflow chat');
    assert.ok(html.includes('state.availableWorkflows'), 'Must list available workflows in the new chat picker');
    assert.ok(html.includes('startNewSession(null)'), 'Must request an unattached session for new workflow');
    assert.ok(html.includes('blank.disabled = isRunning'), 'Must disable new-session options while a run is active');
    assert.ok(html.includes('if (isRunning) return;'), 'Must guard against starting a new session while a run is active');
    assert.ok(html.includes('history-overlay'), 'Must render conversation history as a modal overlay');
    assert.ok(html.includes("type: 'agent.ready'"), 'Must request initial state from the extension host');
    assert.ok(html.includes('openai / gpt-5.4'), 'Must render selected provider/model label');
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

test('Agent Workbench HTML: context usage and compaction follow Yagr runtime contracts', () => {
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
