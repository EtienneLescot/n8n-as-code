/**
 * Tests for naming utilities
 */

import { describe, it, expect } from 'vitest';
import { generatePropertyName, generateClassName, createPropertyNameContext } from '../src/utils/naming.js';

describe('Naming Utilities', () => {
    describe('generatePropertyName', () => {
        it('should convert simple display name to PascalCase', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('Schedule Trigger', context);
            expect(result).toBe('ScheduleTrigger');
        });
        
        it('should remove emojis from display name', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('🕘 Schedule Trigger', context);
            expect(result).toBe('ScheduleTrigger');
        });
        
        it('should handle name collisions with numeric suffix', () => {
            const context = createPropertyNameContext();
            
            const first = generatePropertyName('HTTP Request', context);
            const second = generatePropertyName('HTTP Request', context);
            const third = generatePropertyName('HTTP Request', context);
            
            expect(first).toBe('HttpRequest');
            expect(second).toBe('HttpRequest1');
            expect(third).toBe('HttpRequest2');
        });
        
        it('should handle special characters', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('⚙️ Configuration', context);
            expect(result).toBe('Configuration');
        });
        
        it('should handle mixed case and preserve acronyms', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('HTTP API Request', context);
            expect(result).toBe('HttpApiRequest');
        });
        
        it('should avoid JavaScript reserved words', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('function', context);
            // PascalCase is applied, so 'function' becomes 'Function_'
            expect(result).toBe('Function_');
        });
        
        it('should handle empty or invalid names', () => {
            const context = createPropertyNameContext();
            const result = generatePropertyName('🎯', context);
            expect(result).toBe('Node');
        });

        it('should transliterate accented characters to ASCII', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('Mémoire', context)).toBe('Memoire');
            expect(generatePropertyName('Données', context)).toBe('Donnees');
            expect(generatePropertyName('Ärger', context)).toBe('Arger');
            expect(generatePropertyName('naïve résumé', context)).toBe('NaiveResume');
        });
    });
    
    describe('generateClassName', () => {
        it('should add Workflow suffix if not present', () => {
            const result = generateClassName('Job Application Assistant');
            expect(result).toBe('JobApplicationAssistantWorkflow');
        });
        
        it('should not duplicate Workflow suffix', () => {
            const result = generateClassName('My Workflow');
            // "My Workflow" has "Workflow" in the name, so it becomes just "MyWorkflow"
            expect(result).toBe('MyWorkflow');
        });
        
        it('should handle emojis in workflow name', () => {
            const result = generateClassName('🚀 Deploy Pipeline');
            expect(result).toBe('DeployPipelineWorkflow');
        });
    });
});
