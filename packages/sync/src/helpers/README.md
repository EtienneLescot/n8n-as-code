# Project Helpers

Reusable utilities for organizing and displaying workflows by project.

## Purpose

These helpers provide a consistent way to:
- Group workflows by project
- Sort workflows within groups
- Normalize project names for display (e.g., "Personal" for personal projects)
- Build structured project groups for UI rendering

## Usage

### Basic Example

```typescript
import { 
  groupWorkflowsByProject,
  sortWorkflowsInGroups,
  buildProjectGroups,
  type IProjectGroup
} from '@n8n-as-code/sync';

// Get workflows from API
const workflows = await apiClient.getAllWorkflows();

// Group by project
const grouped = groupWorkflowsByProject(workflows);

// Sort workflows within each group (active first, then alphabetically)
sortWorkflowsInGroups(grouped);

// Build structured groups with display metadata
const projectGroups = buildProjectGroups(grouped, true);

// Display
for (const group of projectGroups) {
  console.log(`${group.displayName} (${group.workflows.length} workflows)`);
  for (const workflow of group.workflows) {
    console.log(`  - ${workflow.name}`);
  }
}
```

### Custom Sorting

```typescript
// Custom sort: sort by creation date
sortWorkflowsInGroups(grouped, (a, b) => {
  return new Date(b.createdAt) - new Date(a.createdAt);
});
```

## API Reference

### `getDisplayProjectName(project: IProject): string`

Returns a user-friendly display name for a project.

- Personal projects (type === 'personal') → "Personal"
- Other projects → original name

**Example:**
```typescript
const project = { id: '123', name: 'john@example.com', type: 'personal' };
getDisplayProjectName(project); // Returns: "Personal"
```

### `getWorkflowProjectName(workflow: IWorkflow, fallback?: string): string`

Gets the display name for a workflow's project.

**Parameters:**
- `workflow` - The workflow
- `fallback` - Name to use if no project (default: "Personal")

**Example:**
```typescript
getWorkflowProjectName(workflow); // "Personal" or project name
getWorkflowProjectName(workflow, "Unassigned"); // Custom fallback
```

### `groupWorkflowsByProject(workflows: IWorkflow[]): Map<string, IWorkflow[]>`

Groups workflows by their project ID.

Returns a Map where:
- Keys are project IDs (or `__NO_PROJECT__` for unassigned workflows)
- Values are arrays of workflows

### `sortWorkflowsInGroups(groups, compareFn?): void`

Sorts workflows within each group **in place**.

**Default sort:** Active first, then alphabetically by name

**Parameters:**
- `groups` - Map from `groupWorkflowsByProject()`
- `compareFn` - Optional custom comparison function

### `buildProjectGroups(groupedWorkflows, sortProjects?): IProjectGroup[]`

Converts grouped workflows into structured project groups.

**Returns:** Array of `IProjectGroup`:
```typescript
interface IProjectGroup {
  id: string;              // Project ID or '__NO_PROJECT__'
  name: string;            // Original project name
  displayName: string;     // User-friendly display name
  project: IProject | null; // Full project object (if available)
  workflows: IWorkflow[];  // Array of workflows
}
```

**Parameters:**
- `groupedWorkflows` - Map from `groupWorkflowsByProject()`
- `sortProjects` - Whether to sort projects (Personal last) (default: true)

## Design Principles

1. **Separation of Concerns**: Data transformation (grouping, sorting) is separate from presentation
2. **Reusability**: Works for CLI, VS Code extension, or any other UI
3. **No Side Effects**: Pure functions that don't modify inputs (except `sortWorkflowsInGroups` which sorts in-place for efficiency)
4. **Graceful Degradation**: Handles missing project data gracefully

## Where These Helpers Are Used

- **CLI** (e.g. `list`, `start`): Status display and workflow name formatting
- **VS Code Extension**: Tree view provider and workflow status display

## Future Extensions

Possible additions:
- `groupWorkflowsByFolder()` - When folder API becomes available
- `filterWorkflows()` - Filter by active/archived/tags
- `searchWorkflows()` - Full-text search across workflow names/descriptions
