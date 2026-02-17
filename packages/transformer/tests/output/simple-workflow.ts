import { workflow, node, links } from '@n8n-as-code/transformer';

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'test-workflow-123',
    name: 'Simple Test Workflow',
    active: true,
    settings: { executionOrder: 'v1' },
})
export class SimpleTestWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.2,
        position: [100, 200],
    })
    ScheduleTrigger = {
        rule: {
            interval: [
                {
                    field: 'cronExpression',
                    expression: '0 9 * * *',
                },
            ],
        },
    };

    @node({
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        version: 4,
        position: [300, 200],
    })
    HttpRequest = {
        url: 'https://api.example.com/data',
        method: 'GET',
    };

    @node({
        name: 'Set Variables',
        type: 'n8n-nodes-base.set',
        version: 3,
        position: [500, 200],
    })
    SetVariables = {
        assignments: {
            assignments: [
                {
                    name: 'result',
                    value: '={{ $json.data }}',
                    type: 'string',
                },
            ],
        },
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ScheduleTrigger.out(0).to(this.HttpRequest.in(0));
        this.HttpRequest.out(0).to(this.SetVariables.in(0));
    }
}
