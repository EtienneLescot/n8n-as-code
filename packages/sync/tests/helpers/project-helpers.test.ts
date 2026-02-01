/**
 * Unit tests for project helpers
 * Run with: npm test -w packages/sync
 */

import { describe, it, expect } from '@jest/globals';
import {
    getDisplayProjectName,
    getWorkflowProjectName,
    groupWorkflowsByProject,
    sortWorkflowsInGroups,
    buildProjectGroups
} from '../src/helpers/project-helpers.js';
import type { IProject, IWorkflow } from '../src/types.js';

describe('Project Helpers', () => {
    describe('getDisplayProjectName', () => {
        it('should return "Personal" for personal projects', () => {
            const project: IProject = {
                id: '123',
                name: 'user@example.com',
                type: 'personal',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01'
            };
            expect(getDisplayProjectName(project)).toBe('Personal');
        });

        it('should return original name for team projects', () => {
            const project: IProject = {
                id: '456',
                name: 'Marketing Team',
                type: 'team',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01'
            };
            expect(getDisplayProjectName(project)).toBe('Marketing Team');
        });
    });

    describe('getWorkflowProjectName', () => {
        it('should return display name when homeProject exists', () => {
            const workflow = {
                id: 'wf1',
                name: 'Test',
                homeProject: {
                    id: '123',
                    name: 'user@example.com',
                    type: 'personal' as const,
                    createdAt: '2024-01-01',
                    updatedAt: '2024-01-01'
                }
            } as IWorkflow;
            
            expect(getWorkflowProjectName(workflow)).toBe('Personal');
        });

        it('should return fallback when homeProject is missing', () => {
            const workflow = { id: 'wf1', name: 'Test' } as IWorkflow;
            expect(getWorkflowProjectName(workflow)).toBe('Personal');
            expect(getWorkflowProjectName(workflow, 'Unassigned')).toBe('Unassigned');
        });
    });

    describe('groupWorkflowsByProject', () => {
        it('should group workflows by projectId', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'W1', projectId: 'p1' } as IWorkflow,
                { id: 'wf2', name: 'W2', projectId: 'p1' } as IWorkflow,
                { id: 'wf3', name: 'W3', projectId: 'p2' } as IWorkflow,
            ];

            const grouped = groupWorkflowsByProject(workflows);

            expect(grouped.size).toBe(2);
            expect(grouped.get('p1')?.length).toBe(2);
            expect(grouped.get('p2')?.length).toBe(1);
        });

        it('should handle workflows without projectId', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'W1', projectId: 'p1' } as IWorkflow,
                { id: 'wf2', name: 'W2' } as IWorkflow,
            ];

            const grouped = groupWorkflowsByProject(workflows);

            expect(grouped.size).toBe(2);
            expect(grouped.has('__NO_PROJECT__')).toBe(true);
            expect(grouped.get('__NO_PROJECT__')?.length).toBe(1);
        });
    });

    describe('sortWorkflowsInGroups', () => {
        it('should sort active workflows first', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'Inactive', active: false } as IWorkflow,
                { id: 'wf2', name: 'Active', active: true } as IWorkflow,
            ];

            const grouped = new Map([['p1', workflows]]);
            sortWorkflowsInGroups(grouped);

            const sorted = grouped.get('p1')!;
            expect(sorted[0].name).toBe('Active');
            expect(sorted[1].name).toBe('Inactive');
        });

        it('should sort alphabetically within same status', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'Zebra', active: false } as IWorkflow,
                { id: 'wf2', name: 'Apple', active: false } as IWorkflow,
                { id: 'wf3', name: 'Banana', active: false } as IWorkflow,
            ];

            const grouped = new Map([['p1', workflows]]);
            sortWorkflowsInGroups(grouped);

            const sorted = grouped.get('p1')!;
            expect(sorted[0].name).toBe('Apple');
            expect(sorted[1].name).toBe('Banana');
            expect(sorted[2].name).toBe('Zebra');
        });

        it('should accept custom comparison function', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'A', createdAt: '2024-01-03' } as IWorkflow,
                { id: 'wf2', name: 'B', createdAt: '2024-01-01' } as IWorkflow,
                { id: 'wf3', name: 'C', createdAt: '2024-01-02' } as IWorkflow,
            ];

            const grouped = new Map([['p1', workflows]]);
            sortWorkflowsInGroups(grouped, (a, b) => 
                new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
            );

            const sorted = grouped.get('p1')!;
            expect(sorted[0].name).toBe('B');
            expect(sorted[1].name).toBe('C');
            expect(sorted[2].name).toBe('A');
        });
    });

    describe('buildProjectGroups', () => {
        it('should build structured groups', () => {
            const project: IProject = {
                id: 'p1',
                name: 'Team Project',
                type: 'team',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01'
            };

            const workflows: IWorkflow[] = [
                { 
                    id: 'wf1', 
                    name: 'W1', 
                    projectId: 'p1',
                    homeProject: project
                } as IWorkflow,
            ];

            const grouped = groupWorkflowsByProject(workflows);
            const groups = buildProjectGroups(grouped, false);

            expect(groups.length).toBe(1);
            expect(groups[0].id).toBe('p1');
            expect(groups[0].name).toBe('Team Project');
            expect(groups[0].displayName).toBe('Team Project');
            expect(groups[0].workflows.length).toBe(1);
        });

        it('should normalize personal project display name', () => {
            const project: IProject = {
                id: 'p1',
                name: 'user@example.com',
                type: 'personal',
                createdAt: '2024-01-01',
                updatedAt: '2024-01-01'
            };

            const workflows: IWorkflow[] = [
                { 
                    id: 'wf1', 
                    name: 'W1', 
                    projectId: 'p1',
                    homeProject: project
                } as IWorkflow,
            ];

            const grouped = groupWorkflowsByProject(workflows);
            const groups = buildProjectGroups(grouped, false);

            expect(groups[0].name).toBe('user@example.com');
            expect(groups[0].displayName).toBe('Personal');
        });

        it('should sort projects when requested', () => {
            const workflows: IWorkflow[] = [
                { id: 'wf1', name: 'W1' } as IWorkflow, // No project
                { 
                    id: 'wf2', 
                    name: 'W2', 
                    projectId: 'p1',
                    homeProject: { 
                        id: 'p1', 
                        name: 'Alpha', 
                        type: 'team' as const,
                        createdAt: '2024-01-01',
                        updatedAt: '2024-01-01'
                    }
                } as IWorkflow,
                { 
                    id: 'wf3', 
                    name: 'W3', 
                    projectId: 'p2',
                    homeProject: { 
                        id: 'p2', 
                        name: 'Zulu', 
                        type: 'team' as const,
                        createdAt: '2024-01-01',
                        updatedAt: '2024-01-01'
                    }
                } as IWorkflow,
            ];

            const grouped = groupWorkflowsByProject(workflows);
            const groups = buildProjectGroups(grouped, true);

            // Should be: Alpha, Zulu, Personal (no-project last)
            expect(groups[0].displayName).toBe('Alpha');
            expect(groups[1].displayName).toBe('Zulu');
            expect(groups[2].id).toBe('__NO_PROJECT__');
        });
    });
});
