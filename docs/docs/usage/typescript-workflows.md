# TypeScript Workflows Guide

## Overview

n8n-as-code now supports **TypeScript workflows** as an alternative to JSON. TypeScript workflows offer:

- **Better readability** - Declarative syntax with decorators
- **Type safety** - IntelliSense and compile-time checks
- **Code review friendly** - Git diffs are easier to understand
- **AI agent compatible** - More natural for AI to read and generate

## Workflow Format Comparison

### JSON Format (Traditional)
```json
{
  "id": "abc123",
  "name": "My Workflow",
  "nodes": [
    {
      "id": "node1",
      "name": "Start",
      "type": "n8n-nodes-base.start",
      "position": [250, 300],
      "parameters": {}
    },
    {
      "id": "node2",
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300],
      "parameters": {
        "url": "https://api.example.com",
        "method": "GET"
      }
    }
  ],
  "connections": {
    "Start": {
      "main": [[{ "node": "HTTP Request", "type": "main", "index": 0 }]]
    }
  }
}
```

### TypeScript Format (New)
```typescript
import 'reflect-metadata';

@workflow({ id: 'abc123', name: 'My Workflow', active: false })
export class MyWorkflow {
    @node({ type: 'n8n-nodes-base.start', position: [250, 300] })
    Start = {};

    @node({ 
        type: 'n8n-nodes-base.httpRequest',
        position: [450, 300]
    })
    HttpRequest = {
        url: 'https://api.example.com',
        method: 'GET'
    };

    @links()
    connections = () => {
        this.Start.out().to(this.HttpRequest);
    };
}
```

## Key Concepts

### 1. Workflow Decorator
The `@workflow` decorator defines workflow metadata:

```typescript
@workflow({ 
    id: 'workflow-id',      // Required for existing workflows
    name: 'My Workflow',    // Workflow name
    active: false           // Activation status
})
export class MyWorkflow { }
```

### 2. Node Decorators
The `@node` decorator defines nodes. Property names become node names:

```typescript
@node({ 
    type: 'n8n-nodes-base.httpRequest',  // Node type (required)
    position: [450, 300]                  // Canvas position (optional)
})
HttpRequestNode = {
    // Node parameters (specific to node type)
    url: 'https://api.example.com',
    method: 'GET'
};
```

#### Node Naming
- Property names are auto-converted to PascalCase
- Collisions are handled automatically (HttpRequest → HttpRequest1, HttpRequest2)
- Use descriptive names for better readability

### 3. Connection Links
The `@links` decorator defines connections using fluent API:

```typescript
@links()
connections = () => {
    // Simple connection: node1 → node2
    this.Start.out().to(this.HttpRequest);
    
    // Multiple outputs: node → [node2, node3]
    this.Switch
        .out(0).to(this.ProcessA)
        .out(1).to(this.ProcessB);
    
    // Named outputs (for multi-output nodes)
    this.IfNode
        .out('true').to(this.ProcessTrue)
        .out('false').to(this.ProcessFalse);
};
```

## Common Patterns

### Basic Linear Workflow
```typescript
@workflow({ name: 'Linear Flow', active: false })
export class LinearFlow {
    @node({ type: 'n8n-nodes-base.start' })
    Start = {};

    @node({ type: 'n8n-nodes-base.httpRequest' })
    FetchData = { url: 'https://api.example.com' };

    @node({ type: 'n8n-nodes-base.code' })
    ProcessData = {
        mode: 'runOnceForAllItems',
        jsCode: 'return items;'
    };

    @links()
    connections = () => {
        this.Start.out().to(this.FetchData);
        this.FetchData.out().to(this.ProcessData);
    };
}
```

### Branching Workflow (Switch)
```typescript
@workflow({ name: 'Branching Flow', active: false })
export class BranchingFlow {
    @node({ type: 'n8n-nodes-base.start' })
    Start = {};

    @node({ type: 'n8n-nodes-base.switch' })
    Switch = {
        mode: 'rules',
        rules: {
            rules: [
                { operation: 'equals', value: 'A' },
                { operation: 'equals', value: 'B' }
            ]
        }
    };

    @node({ type: 'n8n-nodes-base.code' })
    ProcessA = { jsCode: 'return items;' };

    @node({ type: 'n8n-nodes-base.code' })
    ProcessB = { jsCode: 'return items;' };

    @links()
    connections = () => {
        this.Start.out().to(this.Switch);
        this.Switch
            .out(0).to(this.ProcessA)
            .out(1).to(this.ProcessB);
    };
}
```

### Error Handling Workflow
```typescript
@workflow({ name: 'Error Handling', active: false })
export class ErrorHandling {
    @node({ type: 'n8n-nodes-base.start' })
    Start = {};

    @node({ type: 'n8n-nodes-base.httpRequest' })
    RiskyRequest = {
        url: 'https://api.example.com',
        continueOnFail: true
    };

    @node({ type: 'n8n-nodes-base.code' })
    HandleSuccess = { jsCode: 'return items;' };

    @node({ type: 'n8n-nodes-base.code' })
    HandleError = { jsCode: 'return items;' };

    @links()
    connections = () => {
        this.Start.out().to(this.RiskyRequest);
        // Main output → success handler
        this.RiskyRequest.out().to(this.HandleSuccess);
        // Error output → error handler
        this.RiskyRequest.out('error').to(this.HandleError);
    };
}
```

## CLI Commands

### Convert Existing Workflows

**Single file conversion:**
```bash
# JSON → TypeScript
n8nac convert my-workflow.json

# TypeScript → JSON
n8nac convert my-workflow.workflow.ts

# Specify output path
n8nac convert my-workflow.json -o custom-name.workflow.ts

# Force overwrite
n8nac convert my-workflow.json --force
```

**Batch conversion:**
```bash
# Convert all JSON files in directory to TypeScript
n8nac convert-batch ./workflows --format typescript

# Convert all TypeScript files to JSON
n8nac convert-batch ./workflows --format json

# Force overwrite existing files
n8nac convert-batch ./workflows --format typescript --force
```

### Validate Workflows

```bash
# Validate JSON workflow
n8nac skills validate my-workflow.json

# Validate TypeScript workflow
n8nac skills validate my-workflow.workflow.ts

# Strict mode (warnings as errors)
n8nac skills validate my-workflow.workflow.ts --strict
```

### Download Community Workflows

```bash
# Search workflows
n8nac skills examples search "email automation"

# Download as TypeScript (default for .workflow.ts output)
n8nac skills examples download 123

# Custom output path
n8nac skills examples download 123 -o my-workflow.workflow.ts
```

## Migration Guide

### Migrating from JSON to TypeScript

**Option 1: Manual conversion via CLI**
1. Pull your existing workflows (if not already local)
   ```bash
   n8nac list  # See what's available
   n8nac pull <workflowId>  # Pull each workflow you need
   ```

2. Convert workflows to TypeScript
   ```bash
   n8nac convert-batch ./workflows --format typescript
   ```

3. Review and commit the TypeScript files
   ```bash
   git add workflows/*.workflow.ts
   git commit -m "Migrate workflows to TypeScript"
   ```

4. (Optional) Remove old JSON files
   ```bash
   rm workflows/*.json
   ```

**Option 2: Gradual migration**
- Keep both formats during transition
- Convert workflows one by one
- Sync package supports both formats simultaneously

### Best Practices

1. **Use descriptive property names** - They become node names in n8n
   ```typescript
   // ✅ Good
   FetchUserData = { url: '...' }
   ProcessUserProfile = { jsCode: '...' }
   
   // ❌ Avoid
   Node1 = { url: '...' }
   N2 = { jsCode: '...' }
   ```

2. **Group related nodes** - Organize properties logically
   ```typescript
   // Triggers
   @node({ type: 'n8n-nodes-base.webhook' })
   WebhookTrigger = { path: '/webhook' };
   
   // Data fetching
   @node({ type: 'n8n-nodes-base.httpRequest' })
   FetchData = { url: '...' };
   
   // Processing
   @node({ type: 'n8n-nodes-base.code' })
   Transform = { jsCode: '...' };
   ```

3. **Add comments** - Document complex logic
   ```typescript
   // Switch based on user type: admin, user, guest
   @node({ type: 'n8n-nodes-base.switch' })
   UserTypeSwitch = {
       mode: 'rules',
       rules: { /* ... */ }
   };
   ```

4. **Version control** - Commit TypeScript files to Git
   ```bash
   git add workflows/*.workflow.ts
   git commit -m "Add user onboarding workflow"
   ```

## Troubleshooting

### TypeScript Compilation Errors

**Error:** `Cannot find module 'reflect-metadata'`
```bash
# Install reflect-metadata
npm install reflect-metadata
```

**Error:** `Experimental decorators warning`
- This is normal - decorators are enabled in tsconfig.json
- The warning can be safely ignored

### Validation Errors

**"Failed to compile TypeScript workflow"**
- Check syntax errors in your `.workflow.ts` file
- Ensure all imports are present
- Validate decorator usage

**"Node is missing required field"**
- Check that node `type` is specified in `@node` decorator
- Ensure node parameters match the node type schema

### Sync Issues

**Workflows not syncing**
- Ensure file extension is `.workflow.ts` (not just `.ts`)
- Check that workflow has an `id` in `@workflow` decorator
- Verify n8n connection with `n8nac list`

**Hash mismatches**
- TypeScript files are compiled to JSON before hashing
- Formatting differences won't cause conflicts
- Recompile: `n8nac convert workflow.workflow.ts` then back

## Advanced Topics

### Custom Node Types

For custom nodes, import types if available:
```typescript
@node({ type: 'n8n-nodes-custom.myNode' })
CustomNode = {
    customParam: 'value'
};
```

### Workflow Settings

Add workflow settings in the decorator:
```typescript
@workflow({ 
    name: 'My Workflow',
    active: false,
    settings: {
        executionOrder: 'v1',
        saveExecutionProgress: true,
        saveManualExecutions: true
    }
})
export class MyWorkflow { }
```

### Position Layout

Omit positions for AI-generated workflows:
```typescript
// n8n will auto-layout nodes
@node({ type: 'n8n-nodes-base.start' })
Start = {};
```

For manual layout:
```typescript
// [x, y] coordinates on canvas
@node({ type: 'n8n-nodes-base.start', position: [250, 300] })
Start = {};
```

## API Reference

The transformer package provides the following key components:

### Decorators
- `@workflow(metadata)` - Define workflow metadata (id, name, active, etc.)
- `@node(config)` - Define a workflow node with type and configuration
- `@links()` - Define connections between nodes

### Core Classes
- `JsonToAstParser` - Parse JSON workflows to AST representation
- `AstToTypeScriptGenerator` - Generate TypeScript code from AST
- `TypeScriptParser` - Parse TypeScript workflows to AST
- `WorkflowBuilder` - Build n8n JSON from AST representation

## Support

- **Documentation**: [https://etiennelescot.github.io/n8n-as-code/](https://etiennelescot.github.io/n8n-as-code/)
- **Issues**: [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues)
- **Discussions**: [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions)
