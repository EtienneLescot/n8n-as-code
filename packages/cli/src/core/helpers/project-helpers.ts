/**
 * Project-related helper functions for workflow organization
 * 
 * These helpers provide reusable utilities for working with projects
 * across different interfaces (CLI, VS Code extension, etc.)
 */

import { IProject, IWorkflow } from '../types.js';

/**
 * Gets a user-friendly display name for a project.
 * 
 * Personal projects (type === 'personal') are displayed as "Personal"
 * regardless of their actual name (which often includes user email).
 * 
 * @param project The project to get a display name for
 * @returns A user-friendly display name
 */
export function getDisplayProjectName(project: IProject): string {
    return project.type === 'personal' ? 'Personal' : project.name;
}

/**
 * Gets a user-friendly display name for a workflow's project.
 * 
 * If the workflow has no project assignment, returns the fallback.
 * 
 * @param workflow The workflow to get a project name for
 * @param fallback The name to use if the workflow has no project (default: "Personal")
 * @returns A user-friendly display name
 */
export function getWorkflowProjectName(workflow: IWorkflow, fallback: string = 'Personal'): string {
    if (!workflow.homeProject) {
        return fallback;
    }
    return getDisplayProjectName(workflow.homeProject);
}

/**
 * Gets a display name for a project from an object with project metadata.
 * Works with IWorkflow, IWorkflowStatus, or any object with projectName and homeProject.
 * 
 * @param obj Object containing project metadata
 * @param fallback The name to use if no project (default: "Personal")
 * @returns A user-friendly display name
 */
export function getProjectDisplayName(
    obj: { projectName?: string; homeProject?: IProject },
    fallback: string = 'Personal'
): string {
    if (obj.homeProject) {
        return getDisplayProjectName(obj.homeProject);
    }
    return obj.projectName || fallback;
}

/**
 * Groups workflows by their project assignment.
 * 
 * @param workflows Array of workflows to group
 * @returns Map of projectId -> workflows array
 */
export function groupWorkflowsByProject(workflows: IWorkflow[]): Map<string, IWorkflow[]> {
    const NO_PROJECT_KEY = '__NO_PROJECT__';
    const groups = new Map<string, IWorkflow[]>();
    
    for (const workflow of workflows) {
        const projectId = workflow.projectId || NO_PROJECT_KEY;
        
        if (!groups.has(projectId)) {
            groups.set(projectId, []);
        }
        
        groups.get(projectId)!.push(workflow);
    }
    
    return groups;
}

/**
 * Sorts workflows within each project group.
 * 
 * Default sort order: active workflows first, then by name alphabetically.
 * 
 * @param groups Map of projectId -> workflows to sort in-place
 * @param compareFn Optional custom comparison function
 */
export function sortWorkflowsInGroups(
    groups: Map<string, IWorkflow[]>,
    compareFn?: (a: IWorkflow, b: IWorkflow) => number
): void {
    const defaultCompare = (a: IWorkflow, b: IWorkflow): number => {
        // Active workflows first
        if (a.active && !b.active) return -1;
        if (!a.active && b.active) return 1;
        // Then by name
        return a.name.localeCompare(b.name);
    };
    
    const compare = compareFn || defaultCompare;
    
    for (const [, workflows] of groups) {
        workflows.sort(compare);
    }
}

/**
 * Interface for a project with its workflows
 */
export interface IProjectGroup {
    id: string;
    name: string;
    displayName: string;
    project: IProject | null;
    workflows: IWorkflow[];
}

/**
 * Converts grouped workflows into structured project groups with metadata.
 * 
 * @param groupedWorkflows Map of projectId -> workflows
 * @param sortProjects Whether to sort projects (no-project last)
 * @returns Array of project groups with display information
 */
export function buildProjectGroups(
    groupedWorkflows: Map<string, IWorkflow[]>,
    sortProjects: boolean = true
): IProjectGroup[] {
    const NO_PROJECT_KEY = '__NO_PROJECT__';
    const groups: IProjectGroup[] = [];
    
    for (const [projectId, workflows] of groupedWorkflows) {
        const isNoProject = projectId === NO_PROJECT_KEY;
        const firstWorkflow = workflows[0];
        const project = firstWorkflow?.homeProject || null;
        
        const name = isNoProject 
            ? 'Personal'
            : project?.name || 'Unknown Project';
        
        const displayName = project
            ? getDisplayProjectName(project)
            : 'Personal';
        
        groups.push({
            id: projectId,
            name,
            displayName,
            project,
            workflows
        });
    }
    
    if (sortProjects) {
        groups.sort((a, b) => {
            // No-project (Personal) last
            if (a.id === NO_PROJECT_KEY) return 1;
            if (b.id === NO_PROJECT_KEY) return -1;
            // Others alphabetically by display name
            return a.displayName.localeCompare(b.displayName);
        });
    }
    
    return groups;
}

/**
 * Format workflow name with project and archived badges
 * 
 * @param workflow The workflow object (must have name, projectName/homeProject, isArchived)
 * @param options Optional formatting options
 * @returns Workflow name with badges
 */
export function formatWorkflowNameWithBadges(
    workflow: { 
        name: string; 
        projectName?: string; 
        homeProject?: IProject; 
        isArchived?: boolean 
    },
    options?: {
        showProjectBadge?: boolean;
        showArchivedBadge?: boolean;
        maxLength?: number;
        projectBadgeStyle?: (text: string) => string;
        archivedBadgeStyle?: (text: string) => string;
    }
): string {
    const opts = {
        showProjectBadge: true,
        showArchivedBadge: true,
        projectBadgeStyle: (text: string) => text,
        archivedBadgeStyle: (text: string) => text,
        ...options
    };
    
    let name = workflow.name;
    const badges: string[] = [];
    
    // Add project badge (only if not Personal)
    if (opts.showProjectBadge) {
        const projectName = getProjectDisplayName(workflow, '');
        if (projectName && projectName !== 'Personal' && projectName !== '-') {
            badges.push(opts.projectBadgeStyle(`[${projectName}]`));
        }
    }
    
    // Add archived badge
    if (opts.showArchivedBadge && workflow.isArchived) {
        badges.push(opts.archivedBadgeStyle('[archived]'));
    }
    
    // Truncate name if needed (before adding badges)
    if (opts.maxLength && name.length > opts.maxLength) {
        name = name.substring(0, opts.maxLength - 3) + '...';
    }
    
    // Combine name and badges
    if (badges.length > 0) {
        return `${name} ${badges.join(' ')}`;
    }
    
    return name;
}
