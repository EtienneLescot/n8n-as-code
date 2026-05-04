import test from 'node:test';
import assert from 'node:assert';

test('Agent Workbench HTML: workflow reload forces iframe navigation', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/__n8n-manager/open-workflow/wf-1',
        workflowReloadUrl: 'http://localhost:5678/workflow/wf-1',
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
    });

    assert.ok(html.includes('node-context-badge'), 'Must render the node context badge container');
    assert.ok(html.includes('bridge-status'), 'Must render the n8n bridge status marker');
    assert.ok(html.includes("message.type === 'n8n-bridge-ready'"), 'Must handle iframe bridge ready events');
    assert.ok(html.includes("message.type === 'n8n-ui-click'"), 'Must handle iframe click diagnostics');
    assert.ok(html.includes("message.type === 'n8n-ui-change'"), 'Must handle iframe UI mutation diagnostics');
    assert.ok(html.includes("message.type === 'n8n-node-context-cleared'"), 'Must clear node context from iframe events');
    assert.ok(html.includes('isWorkflowFrameEvent'), 'Must validate iframe-originated node context messages');
    assert.ok(html.includes("message.type === 'n8n-node-detail-opened'"), 'Must handle node detail messages from iframe');
    assert.ok(html.includes("type: 'agent.nodeDetailChanged'"), 'Must forward node context to extension host');
    assert.ok(html.includes("nodeContext: currentNodeContext"), 'Must include node context when sending prompts');
});

test('Agent Workbench HTML: renders chat build marker', () => {
    const { buildAgentWorkbenchHtml } = require('../../src/ui/agent-workbench-html.js');
    const html: string = buildAgentWorkbenchHtml({
        workflowId: 'wf-1',
        workflowName: 'Workflow 1',
        workflowUrl: 'http://localhost:5678/workflow/wf-1',
    });

    assert.ok(html.includes('Chat build 2026.05.04.8'), 'Must render visible chat build marker');
});
