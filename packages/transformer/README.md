# @n8n-as-code/transformer

> **✨ NEW in v0.2.0**: This package enables the new **TypeScript workflow format** (`.workflow.ts`) that replaces JSON as the default storage format across n8n-as-code.

Bidirectional transformer for n8n workflows: JSON ↔ TypeScript

## Overview

This package provides the core transformation engine that converts:
- **JSON → TypeScript**: n8n workflow JSON (from API) → TypeScript class with decorators
- **TypeScript → JSON**: TypeScript workflow class → n8n workflow JSON (for API)

## Features

- ✅ **Bidirectional transformation** with roundtrip support
- ✅ **TypeScript decorators** for clean, readable workflow definitions
- ✅ **Auto-layout support** for AI-generated workflows (optional positions)
- ✅ **Name collision handling** (HttpRequest1, HttpRequest2, ...)
- ✅ **Prettier integration** for formatted output
- ✅ **AI dependency injection** syntax for LangChain nodes

## Installation

```bash
npm install @n8n-as-code/transformer
```

## Usage

### For Workflow Authors (TypeScript)

```typescript
import { workflow, node, links } from '@n8n-as-code/transformer';

@workflow({
    id: "unique-workflow-id",
    name: "My Workflow",
    active: true,
    settings: { executionOrder: "v1" }
})
export class MyWorkflow {
    
    @node({
        name: "Schedule Trigger",
        type: "n8n-nodes-base.scheduleTrigger",
        version: 1.2,
        position: [0, 0]
    })
    ScheduleTrigger = {
        rule: {
            interval: [{
                field: "cronExpression",
                expression: "0 9 * * 1-5"
            }]
        }
    };
    
    @node({
        name: "HTTP Request",
        type: "n8n-nodes-base.httpRequest",
        version: 4,
        position: [200, 0]
    })
    HttpRequest = {
        url: "https://api.example.com/data",
        method: "GET"
    };
    
    @links()
    defineRouting() {
        this.ScheduleTrigger.out(0).to(this.HttpRequest.in(0));
    }
}
```

### For Package Developers (Transformation)

```typescript
import { JsonToAstParser, AstToTypeScriptGenerator } from '@n8n-as-code/transformer';

// JSON → TypeScript
const parser = new JsonToAstParser();
const ast = parser.parse(workflowJson);

const generator = new AstToTypeScriptGenerator();
const tsCode = await generator.generate(ast, {
    format: true,
    commentStyle: 'verbose'
});

console.log(tsCode); // Ready to write to .workflow.ts file
```

```typescript
import { TypeScriptParser, WorkflowBuilder } from '@n8n-as-code/transformer';

// TypeScript → JSON (Phase 2 - coming soon)
const parser = new TypeScriptParser();
const ast = await parser.parseFile('my-workflow.ts');

const builder = new WorkflowBuilder();
const workflowJson = builder.build(ast);

console.log(workflowJson); // Ready to push to n8n API
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                                             │
│  n8n JSON Workflow (API)                   │
│                                             │
└──────────────┬──────────────────────────────┘
               │
               │ JsonToAstParser
               ▼
┌─────────────────────────────────────────────┐
│                                             │
│  WorkflowAST (Intermediate)                │
│  - Normalized structure                     │
│  - Property names instead of UUIDs          │
│                                             │
└──────────────┬──────────────────────────────┘
               │
               │ AstToTypeScriptGenerator
               ▼
┌─────────────────────────────────────────────┐
│                                             │
│  TypeScript Workflow (.workflow.ts)        │
│  - Decorators (@workflow, @node, @links)   │
│  - Human-readable property names            │
│  - Formatted with Prettier                  │
│                                             │
└─────────────────────────────────────────────┘
```

## Status

- ✅ **Phase 1**: Architecture & decorators (COMPLETE)
- 🚧 **Phase 2**: Core transformation logic (IN PROGRESS)
- ⏳ **Phase 3**: Integration with @n8n-as-code/sync
- ⏳ **Phase 4**: Integration with @n8n-as-code/skills

## API Reference

### Decorators

#### `@workflow(metadata)`

Marks a class as an n8n workflow.

**Parameters:**
- `id`: Workflow ID (UUID)
- `name`: Workflow name
- `active`: Whether workflow is active
- `settings?`: Workflow settings (executionOrder, etc.)

#### `@node(metadata)`

Marks a property as an n8n node.

**Parameters:**
- `name`: Node display name
- `type`: Node type (e.g., "n8n-nodes-base.httpRequest")
- `version`: Node version
- `position?`: [x, y] coordinates (optional for auto-layout)
- `credentials?`: Node credentials
- `onError?`: Error handling behavior

#### `@links()`

Marks the method that defines workflow routing.

### Transformation Classes

#### `JsonToAstParser`

Parses n8n JSON to intermediate AST.

```typescript
const parser = new JsonToAstParser();
const ast = parser.parse(workflowJson);
```

#### `AstToTypeScriptGenerator`

Generates TypeScript code from AST.

```typescript
const generator = new AstToTypeScriptGenerator();
const code = await generator.generate(ast, options);
```

**Options:**
- `format?: boolean` - Apply Prettier formatting (default: true)
- `commentStyle?: 'minimal' | 'verbose'` - Comment style (default: 'verbose')
- `className?: string` - Custom class name

## Development

```bash
# Build
npm run build

# Tests
npm test

# Type check
npm run typecheck
```

## License

See LICENSE in repository root.
