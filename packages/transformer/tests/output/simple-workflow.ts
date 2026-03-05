import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : Simple Test Workflow
// Nodes   : 3  |  Connections: 2
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ScheduleTrigger                    scheduleTrigger
// HttpRequest                        httpRequest
// SetVariables                       set
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ScheduleTrigger
//    → HttpRequest
//      → SetVariables
// </workflow-map>

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
        id: 'node-uuid-001',
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
        id: 'node-uuid-002',
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
        id: 'node-uuid-003',
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
