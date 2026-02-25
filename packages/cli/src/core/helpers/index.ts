/**
 * Helper utilities for workflow and project management
 * 
 * This module exports reusable helper functions that can be used
 * across different interfaces (CLI, VS Code extension, etc.)
 */

export {
    getDisplayProjectName,
    getWorkflowProjectName,
    getProjectDisplayName,
    groupWorkflowsByProject,
    sortWorkflowsInGroups,
    buildProjectGroups,
    formatWorkflowNameWithBadges,
    type IProjectGroup
} from './project-helpers.js';
