import { WorkflowValidator } from '../src/services/workflow-validator.js';
import { NodeSchemaProvider } from '../src/services/node-schema-provider.js';
import path from 'path';
import { fileURLToPath } from 'url';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

describe('WorkflowValidator', () => {
    let validator: WorkflowValidator;

    beforeAll(() => {
        // Use the actual technical index from assets for realistic testing if available
        const indexPath = path.resolve(_dirname, '../src/assets/n8n-nodes-technical.json');
        validator = new WorkflowValidator(indexPath);
    });

    it('should validate a simple valid workflow', () => {
        const workflow = {
            nodes: [
                {
                    id: '1',
                    name: 'Start',
                    type: 'n8n-nodes-base.start',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {}
                }
            ],
            connections: {}
        };

        const result = validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
    });

    it('should NOT fail if node ID is missing (Warning only)', () => {
        const workflow = {
            nodes: [
                {
                    name: 'MyNode',
                    type: 'n8n-nodes-base.httpRequest',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {
                        url: 'https://example.com'
                    }
                }
            ],
            connections: {}
        };

        const result = validator.validateWorkflow(workflow);
        expect(result.valid).toBe(true); // Should still be valid!
        expect(result.errors.length).toBe(0);
        expect(result.warnings.some(w => w.message.includes('id'))).toBe(true);
    });

    it('should fail if required parameters are missing', () => {
        const workflow = {
            nodes: [
                {
                    name: 'HTTP Request',
                    type: 'n8n-nodes-base.httpRequest',
                    typeVersion: 1,
                    position: [100, 100],
                    parameters: {} // Missing 'url'
                }
            ],
            connections: {}
        };

        const result = validator.validateWorkflow(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.message.includes('url'))).toBe(true);
    });
});
