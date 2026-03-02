import { describe, it, expect } from 'vitest';
import { generatePropertyName, generateClassName, createPropertyNameContext } from '../src/utils/naming.js';

describe('Naming Utils', () => {
    describe('generatePropertyName', () => {
        it('should convert simple names to PascalCase', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('http request', context)).toBe('HttpRequest');
            expect(generatePropertyName('my node', context)).toBe('MyNode');
            expect(generatePropertyName('start', context)).toBe('Start');
        });

        it('should handle collisions by appending numbers', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('http request', context)).toBe('HttpRequest');
            expect(generatePropertyName('http request', context)).toBe('HttpRequest1');
            expect(generatePropertyName('http request', context)).toBe('HttpRequest2');
        });

        it('should remove emojis and special characters', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('🚀 Start', context)).toBe('Start');
            expect(generatePropertyName('Node-1', context)).toBe('Node1');
            // @ acts as word separator, so "My@Node" becomes "MyNode"
            expect(generatePropertyName('My@Node', context)).toBe('MyNode');
        });

        it('should handle reserved JavaScript words', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('function', context)).toBe('Function_');
            expect(generatePropertyName('class', context)).toBe('Class_');
            expect(generatePropertyName('return', context)).toBe('Return_');
        });

        it('should handle empty or invalid names', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('', context)).toBe('Node');
            // Numbers are prefixed with underscore to make valid identifiers
            expect(generatePropertyName('123', context)).toBe('_123');
            // '!!!' also becomes 'Node', but 'Node' is already used, so we get 'Node1'
            expect(generatePropertyName('!!!', context)).toBe('Node1');
        });

        it('should handle camelCase input', () => {
            const context = createPropertyNameContext();
            // camelCase without word separators becomes single word: first char upper + rest lower
            expect(generatePropertyName('httpRequest', context)).toBe('Httprequest');
            expect(generatePropertyName('myCustomNode', context)).toBe('Mycustomnode');
        });

        it('should handle multiple spaces and special chars', () => {
            const context = createPropertyNameContext();
            expect(generatePropertyName('  Start   Node  ', context)).toBe('StartNode');
            expect(generatePropertyName('Node---1', context)).toBe('Node1');
        });

        it('should not crash on null or undefined (missing JSON fields)', () => {
            const context = createPropertyNameContext();
            // Workflow JSON from community sites sometimes omits the name field entirely
            expect(generatePropertyName(null as unknown as string, context)).toBe('Node');
            expect(generatePropertyName(undefined as unknown as string, context)).toBe('Node1');
        });
    });

    describe('generateClassName', () => {
        it('should generate a PascalCase class name with Workflow suffix', () => {
            expect(generateClassName('Job Application Assistant')).toBe('JobApplicationAssistantWorkflow');
            // already ending with "Workflow" → not doubled
            expect(generateClassName('My Workflow')).toBe('MyWorkflow');
            expect(generateClassName('Send Slack Message')).toBe('SendSlackMessageWorkflow');
        });

        it('should not crash on null or undefined workflow name', () => {
            expect(generateClassName(null as unknown as string)).toBe('NodeWorkflow');
            expect(generateClassName(undefined as unknown as string)).toBe('NodeWorkflow');
        });
    });
});
