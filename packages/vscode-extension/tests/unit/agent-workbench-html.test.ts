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
