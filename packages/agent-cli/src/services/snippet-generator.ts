import fs from 'fs';
import { NodeSchemaProvider } from './node-schema-provider.js';

export class SnippetGenerator {
    constructor(private customIndexPath?: string) { }

    async generate(projectRoot: string): Promise<void> {
        const provider = new NodeSchemaProvider(this.customIndexPath);

        let nodeTypes: any[] = [];

        try {
            nodeTypes = provider.listAllNodes();
        } catch (e) {
            // Index loading failed, fall back to hardcoded
            console.warn("Failed to load node index for snippets, using fallbacks.");
        }

        const snippets: any = {};

        // If no nodes found, generate generic ones
        if (!nodeTypes || nodeTypes.length === 0) {
            // Hardcoded common nodes for fallback
            this.addFallbackSnippets(snippets);
        } else {
            for (const node of nodeTypes) {
                // node.name is camelCase (e.g. googleSheets). 
                // We want n8n-googleSheets
                const key = `n8n-${node.name}`;
                snippets[key] = {
                    prefix: key,
                    body: [
                        "{",
                        `  "parameters": {},`,
                        `  "name": "${node.displayName}",`,
                        `  "type": "n8n-nodes-base.${node.name}",`,
                        `  "typeVersion": ${Array.isArray(node.version) ? Math.max(...node.version) : node.version},`,
                        `  "position": [0, 0]`,
                        "}"
                    ],
                    description: `Insert a ${node.displayName} node`
                };
            }
        }


        const vscodeDir = `${projectRoot}/.vscode`;
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        fs.writeFileSync(`${vscodeDir}/n8n.code-snippets`, JSON.stringify(snippets, null, 2));
    }

    private addFallbackSnippets(snippets: any) {
        const commonNodes = [
            {
                name: "Webhook",
                type: "n8n-nodes-base.webhook",
                ver: 1,
                icon: "⚡",
                params: { "path": "webhook", "httpMethod": "POST" }
            },
            {
                name: "Code",
                type: "n8n-nodes-base.code",
                ver: 2,
                icon: "💻",
                params: { "jsCode": "// Access data with $('NodeName').item.json\nreturn [{ json: { hello: 'world' } }];" }
            },
            {
                name: "HTTP Request",
                type: "n8n-nodes-base.httpRequest",
                ver: 4,
                icon: "🌐",
                params: { "url": "https://api.example.com", "method": "GET" }
            },
            {
                name: "Schedule Trigger",
                type: "n8n-nodes-base.scheduleTrigger",
                ver: 1,
                icon: "⏰",
                params: { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] } }
            },
            {
                name: "Split In Batches",
                type: "n8n-nodes-base.splitInBatches",
                ver: 1,
                icon: "📦",
                params: { "batchSize": 10 }
            },
            {
                name: "Switch",
                type: "n8n-nodes-base.switch",
                ver: 1,
                icon: "🔀",
                params: { "datatypes": "string", "rules": { "rules": [{ "operation": "equals" }] } }
            },
            {
                name: "Merge",
                type: "n8n-nodes-base.merge",
                ver: 2,
                icon: "🔗",
                params: { "mode": "append" }
            },
            {
                name: "Google Sheets",
                type: "n8n-nodes-base.googleSheets",
                ver: 3,
                icon: "📊",
                params: { "operation": "append", "resource": "row" }
            },
            {
                name: "Slack",
                type: "n8n-nodes-base.slack",
                ver: 2,
                icon: "💬",
                params: { "channel": "general", "text": "Hello form n8n" }
            },
            {
                name: "Postgres",
                type: "n8n-nodes-base.postgres",
                ver: 1,
                icon: "🐘",
                params: { "operation": "executeQuery", "query": "SELECT * FROM users;" }
            }
        ];

        for (const node of commonNodes) {
            const key = `n8n-${node.name.toLowerCase().replace(/\s+/g, '-')}`;
            snippets[key] = {
                prefix: key,
                body: [
                    "{",
                    `  "parameters": ${JSON.stringify(node.params)},`,
                    `  "name": "${node.name}",`,
                    `  "type": "${node.type}",`,
                    `  "typeVersion": ${node.ver},`,
                    `  "position": [0, 0]`,
                    "}"
                ],
                description: `${node.icon} Insert a ${node.name} node`
            };
        }
    }
}
