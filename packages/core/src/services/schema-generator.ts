import fs from 'fs';
import path from 'path';
import { N8nApiClient } from './n8n-api-client.js';

export class SchemaGenerator {
    constructor() { }

    /**
     * Fetches node types from n8n and generates a standard JSON Schema.
     * This schema can be used by AI agents to validate node parameters.
     */
    async generateSchema(outputPath: string): Promise<void> {
        // Defines the structure of an n8n workflow JSON
        const schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "n8n Workflow Structure",
            "description": "Validation schema for n8n workflow JSON files",
            "type": "object",
            "required": ["nodes", "connections"],
            "properties": {
                "name": { "type": "string", "description": "Name of the workflow" },
                "nodes": {
                    "type": "array",
                    "description": "List of nodes in the workflow",
                    "items": {
                        "type": "object",
                        "required": ["parameters", "id", "name", "type", "typeVersion", "position"],
                        "properties": {
                            "parameters": {
                                "type": "object",
                                "description": "Configuration parameters for the node"
                            },
                            "id": { "type": "string", "description": "Unique UUID of the node" },
                            "name": { "type": "string", "description": "Display name of the node" },
                            "type": { "type": "string", "description": "Node type identifier (e.g., n8n-nodes-base.httpRequest)" },
                            "typeVersion": { "type": ["number", "object"], "description": "Version of the node type" },
                            "position": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 2,
                                "items": { "type": "number" },
                                "description": "[x, y] coordinates on the canvas"
                            },
                            "notesInFlow": { "type": "boolean" },
                            "notes": { "type": "string" }
                        }
                    }
                },
                "connections": {
                    "type": "object",
                    "description": "Connections between nodes",
                    "patternProperties": {
                        "^.*$": {
                            "type": "object",
                            "patternProperties": {
                                "^main$": {
                                    "type": "array",
                                    "items": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "required": ["node", "type", "index"],
                                            "properties": {
                                                "node": { "type": "string", "description": "Target node name" },
                                                "type": { "type": "string", "enum": ["main"], "default": "main" },
                                                "index": { "type": "number", "default": 0 }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "settings": { "type": "object" },
                "staticData": { "type": ["object", "null"] },
                "pinData": { "type": "object" }
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    }
}
