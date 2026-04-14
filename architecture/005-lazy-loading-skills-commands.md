# RFC: Lazy Loading of `skills` Subcommands

- **RFC**: 005
- **Title**: Lazy Loading of `skills` Subcommands
- **Status**: Draft
- **Tracking Issue**: #325
- **Target**: `next`
- **Author**: Olistar (for Etienne Lescot)
- **Created**: 2026-04-14

---

## 1. Summary

The `npx --yes n8nac` CLI currently loads **91 Mo of JSON assets synchronously at startup**, before Commander.js has even parsed which subcommand the user invoked. This means **every command** — including `npx --yes n8nac --help` — suffers a multi-second I/O penalty.

This RFC specifies a **lazy loading architecture** for the `skills` subcommand tree: the skills assets (node schemas, documentation, knowledge index) and all associated service classes (`NodeSchemaProvider`, `DocsProvider`, `KnowledgeSearch`, etc.) must only be loaded when the user explicitly runs a `skills` subcommand, not on every CLI invocation.

---

## 2. Problem Statement

### 2.1 Observed Behavior

When running `time npx --yes n8nac --help`:

```
npx --yes n8nac --help  1.57s user 0.76s system 6% cpu 38.424 total
```

- **user + sys**: ~2.3 s — actual CPU work
- **total**: ~38 s — wall-clock time
- **I/O wait**: ~36 s — spent reading JSON assets from disk

Even though `npx` caches the package after first invocation, every new process must re-load all 91 Mo of skills assets before Commander can dispatch to any command handler.

### 2.2 Root Cause

In `packages/cli/src/index.ts`:

```typescript
// index.ts — executed on EVERY n8nac invocation
import { registerSkillsCommands } from '@n8n-as-code/skills';
// ...
// called at module scope, before arguments are parsed
registerSkillsCommands(program, assetsDir);
```

And in `packages/skills/src/commands/skills-commander.ts`, `registerSkillsCommands` immediately constructs all services synchronously:

```typescript
const provider    = new NodeSchemaProvider(join(assetsDir, 'n8n-nodes-technical.json'), customNodesPath);
const docsProvider    = new DocsProvider(join(assetsDir, 'n8n-docs-complete.json'));
const knowledgeSearch = new KnowledgeSearch(join(assetsDir, 'n8n-knowledge-index.json'));
const registry    = new WorkflowRegistry();
// ... all JSON files read via readFileSync here
```

This happens on **every** `n8nac` call, even `npx --yes n8nac --help`.

### 2.3 Affected Assets (91 Mo total)

| File | Size | Loaded by |
|---|---|---|
| `n8n-nodes-technical.json` | 30 Mo | `NodeSchemaProvider` |
| `n8n-nodes-index.json` | 27 Mo | (part of technical schema pipeline) |
| `n8n-docs-complete.json` | 11 Mo | `DocsProvider` |
| `n8n-knowledge-index.json` | 15 Mo | `KnowledgeSearch` + FlexSearch index |
| `workflows-index.json` | 9 Mo | `AiContextGenerator` |

---

## 3. Goals

1. **`n8nac --help`, `n8nac list`, `n8nac pull`, etc.** must be **instant** (no skills assets loaded)
2. **`n8nac skills *`** must load skills assets **only when first needed**
3. Subsequent `n8nac skills *` calls within the **same process** may reuse already-loaded state (acceptable)
4. The fix must be **backwards-compatible** — no change to user-facing CLI interface
5. The fix must work for both the **unified `n8nac` CLI** and the **standalone `n8nac-skills` binary**

---

## 4. Non-Goals

- Lazy-loading of `list`, `pull`, `push`, `init`, etc. (not affected by this RFC)
- Changes to the n8n-as-code library API consumed by other packages
- Pre-loading or pre-warming of skills assets

---

## 5. Technical Approach

### 5.1 Commander.js Lazy Subcommands

Commander supports lazy-loaded subcommands via `.command().action(() => import(...))` pattern. The subcommand is registered with an action function that returns a Promise resolving to the actual handler module.

**Pattern:**
```typescript
// Instead of:
program.command('skills').action(async () => {
  const { registerSkillsCommands } = await import('@n8n-as-code/skills');
  registerSkillsCommands(skillsProgram, assetsDir);
  await skillsProgram.parse(['node', 'cmd', 'skills', ...args]);
});

// Commander way (Commander handles the import automatically):
program.command('skills', { isDefault: false })
  .action(async () => {
    // This is called AFTER Commander has matched 'skills'
    // We can now do the heavy import here
  });
```

Actually, the cleanest pattern for Commander v12+ is:

```typescript
// In index.ts — lightweight registration at startup
program
  .command('skills')
  .description('AI-powered skills for n8n workflows (node schemas, docs, examples, search)')
  .addCommand(buildSkillsCommandLazy()); // returns a PreparedCommand
```

Where `buildSkillsCommandLazy()` uses Commander's `.command().action(() => import(...))` mechanism.

### 5.2 Proposed File Structure

```
packages/cli/src/
  index.ts                    # registers 'skills' as lazy command (no assets loaded at startup)
  commands/
    skills-wrapper.ts         # new file: thin wrapper that does the dynamic import + delegates

packages/skills/src/
  commands/
    skills-commander.ts       # unchanged signature: registerSkillsCommands(program, assetsDir)
    skills-commands/          # new directory: individual skill subcommands as separate lazy modules
      search.ts
      node-info.ts
      node-schema.ts
      docs.ts
      examples.ts
      validate.ts
      format.ts
      mcp.ts
  services/
    # existing services — no changes needed (they are already lazy at the class level
    # in the sense that they only load on method calls, but the constructor triggers load)
    # → see Section 5.3
```

**Key insight:** The problem is not lazy **commands** — it's lazy **services**. The service classes (`NodeSchemaProvider`, etc.) do `readFileSync` in their constructors or in `loadIndex()` called from constructors. We need to defer even the **service instantiation** until the first skill command is invoked.

### 5.3 Service-Level Lazy Loading (Required Change)

Each service class currently eagerly loads its JSON in the constructor. We need to make loading explicit and deferred.

#### Option A: Lazy Service Pattern (Preferred)

Add a `ensureLoaded()` method to each service and make the constructor lightweight. All public methods call `ensureLoaded()` first.

```typescript
// BEFORE (eager)
export class NodeSchemaProvider {
  constructor(indexPath: string, customNodesPath?: string) {
    this.indexPath = indexPath;
    this.customNodesPath = customNodesPath;
    this.loadIndex(); // ← readFileSync here, synchronously
  }
}

// AFTER (lazy)
export class NodeSchemaProvider {
  private _index: NodeIndex[] | null = null;  // null = not loaded
  private _customNodes: CustomNodeDefinition[] | null = null;

  constructor(
    private readonly indexPath: string,
    private readonly customNodesPath?: string
  ) {
    // Constructor is lightweight — no I/O
  }

  private ensureLoaded(): void {
    if (this._index !== null) return; // already loaded
    const content = fs.readFileSync(this.indexPath, 'utf-8');
    this._index = JSON.parse(content);
    // load custom nodes too...
  }

  // All public methods call ensureLoaded() first
  getNode(nodeType: string): NodeDefinition | undefined {
    this.ensureLoaded();
    return this._index.find(n => n.type === nodeType);
  }
}
```

#### Option B: Getter Interception

Use a JavaScript Proxy or `Object.defineProperty` with a getter that triggers loading on first access. More complex; not recommended.

### 5.4 Standalone `n8nac-skills` Binary

The standalone binary in `packages/skills/src/cli.ts` currently calls `registerSkillsCommands(program, assetsDir)` synchronously. For the standalone binary, lazy loading is **less critical** (the user is already explicitly invoking `n8nac-skills` for a skills task), but implementing it here too keeps the architecture consistent.

The `cli.ts` entry point can remain unchanged — it can still call `registerSkillsCommands` synchronously, since by definition the user is already in a `skills` context. The lazy loading optimization applies only to the **unified `n8nac` CLI** where skills is one of many subcommands.

### 5.5 `skills` Subcommand Tree as a Separate Module

To enable Commander's lazy loading mechanism cleanly, the `skills` subcommand tree should be defined in a **separate module** (`skills-wrapper.ts`) that is dynamically imported when the `skills` command is first invoked.

```typescript
// packages/cli/src/commands/skills-wrapper.ts

import { Command } from 'commander';
import { registerSkillsCommands } from '@n8n-as-code/skills';
import { getSkillsAssetsDir } from '../index.js'; // reuse existing asset resolution

export function buildSkillsCommand(): Command {
  const cmd = new Command('skills');
  cmd.description('AI-powered skills for n8n workflows');

  // Register all skills subcommands synchronously.
  // This is only called when the user types `n8nac skills ...`
  // and Commander has already matched the 'skills' token.
  registerSkillsCommands(cmd, getSkillsAssetsDir());

  return cmd;
}
```

And in `index.ts`:

```typescript
// packages/cli/src/index.ts

// NOT imported at module scope:
// import { registerSkillsCommands } from '@n8n-as-code/skills'; // REMOVE from top-level

// Instead, lazy-load the entire skills tree:
async function main() {
  // ... existing setup ...

  // Skills command is registered last so it doesn't block startup
  const { buildSkillsCommand } = await import('./commands/skills-wrapper.js');
  program.addCommand(buildSkillsCommand());

  await program.parseAsync(process.argv);
}
```

**Wait — this still loads all skills assets synchronously** because `buildSkillsCommand()` calls `registerSkillsCommands()` which calls all the service constructors. The lazy loading must happen **inside** `registerSkillsCommands`, not just around it.

So the correct approach requires **both**:
1. `buildSkillsCommand()` is called lazily (so `skills` is only added to the command tree when needed — but it IS added eagerly to the tree; only the action is lazy)
2. **More importantly**: the service constructors inside `registerSkillsCommands` must not do I/O at construction time

### 5.6 The Lazy Registration Pattern

Commander's "lazy command" pattern works like this:

```typescript
// Parent program
program
  .command('skills', { isDefault: false })
  .action(async (opts, subCmd) => {
    // This action runs ONLY when 'skills' is matched.
    // At this point we know the user wants skills.
    // Now we import and register the full subcommand tree.
    const { buildSkillsCommand } = await import('./commands/skills-wrapper.js');
    const skillsCmd = buildSkillsCommand();
    // Replace the current command with the fully-populated one
    // Commander allows adding subcommands at runtime
    program.commands.pop(); // remove the placeholder
    skillsCmd.parse(['node', 'cmd', ...]); // delegate remaining args
  });
```

However, this is complex. A simpler approach that achieves the same goal:

**The skills command IS registered eagerly (so Commander's help works), but `registerSkillsCommands` is made async and called lazily:**

```typescript
// In index.ts — BEFORE (eager)
import { registerSkillsCommands } from '@n8n-as-code/skills';
registerSkillsCommands(program, assetsDir); // runs at module load time!

// In index.ts — AFTER (lazy)
const skillsCmd = program.command('skills');
skillsCmd.description('AI-powered skills (lazy-loaded)');
skillsCmd.action(async () => {
  // Only reaches here when user types `n8nac skills ...`
  const { registerSkillsCommands } = await import('@n8n-as-code/skills');
  registerSkillsCommands(skillsCmd, getSkillsAssetsDir());
  await skillsCmd.parseAsync(process.argv);
});
```

But this creates a new problem: `skillsCmd.action()` runs **after** Commander has already consumed the `skills` token. So the action needs to re-parse the remaining arguments with the newly-populated subcommands. This is the "re-proxy" pattern and it works but requires care.

### 5.7 Recommended Minimal Implementation

After analysis, the **minimal viable lazy loading** that solves the problem:

1. **Keep `registerSkillsCommands` signature unchanged** — it's called eagerly from `cli.ts` (the standalone skills binary) and will remain that way
2. **For the unified `n8nac` CLI only** (`packages/cli/src/index.ts`): make `registerSkillsCommands` call conditional, gated behind an async import
3. **Change service constructors** to be lazy (Option A from section 5.3) — this is the core fix
4. **No changes to the `skills` subcommand structure** — commands, options, descriptions all remain the same

This way:
- `n8nac --help` / `n8nac list` / etc. → instant, no I/O
- `n8nac skills search foo` → loads skills assets once, then uses them

---

## 6. File Change Map

| File | Change | Reason |
|---|---|---|
| `packages/skills/src/services/node-schema-provider.ts` | Lazy loading in constructor | 30 Mo readFileSync removed from startup |
| `packages/skills/src/services/docs-provider.ts` | Lazy loading in constructor | 11 Mo readFileSync removed from startup |
| `packages/skills/src/services/knowledge-search.ts` | Lazy index loading | 15 Mo + FlexSearch init deferred |
| `packages/skills/src/services/ai-context-generator.ts` | Lazy assets loading | 9 Mo deferred |
| `packages/skills/src/commands/skills-commander.ts` | `registerSkillsCommands` made async (optional) | enables async lazy import |
| `packages/cli/src/index.ts` | Lazy import of skills wrapper | gates entire skills tree loading |
| `packages/skills/src/cli.ts` | Unchanged | standalone binary benefits from lazy services but not lazy command |

---

## 7. Backwards Compatibility

- **CLI interface**: No change. `npx --yes n8nac skills search "foo"` behaves identically.
- **API consumers**: `registerSkillsCommands(program, assetsDir)` still accepts the same arguments.
- **Standalone `n8nac-skills` binary**: Works exactly as before (assets loaded on invocation of any skills command, which is expected for a standalone binary).
- **`--help` output**: Skills subcommands must still appear in `npx --yes n8nac --help`. Commander requires commands to be registered before `program.parse()` is called for help to work. This means we need to register the **structure** (command names, descriptions, option flags) eagerly, but defer the **action handlers** and **service instantiation**.

**The solution**: Register command structure eagerly (so `--help` works), but lazy-load the action handlers via dynamic `import()` inside each subcommand's action.

```typescript
// Pseudo-code:
program.command('skills')
  .description('AI-powered skills')
  .addCommand(buildSkillsSubcommand('search', {
    description: 'Search across nodes, docs, examples, and knowledge base',
    options: [
      ['-q, --query <query>', 'Search query (required)'],
      ['-t, --type <type>', 'Filter by type: node, docs, example'],
    ]
  }, async (opts) => {
    // Lazy: only imported when 'n8nac skills search' is actually invoked
    const { searchSkill } = await import('./skills-commands/search.js');
    await searchSkill(opts);
  }));
```

But this requires breaking up `skills-commander.ts` into per-command modules — significant refactoring.

**Alternative (simpler)**: Keep command structure registration eager (so `--help` works), but gate only the **service instantiation** behind lazy loading. The command structure IS registered at startup (satisfying `--help` requirements), but no JSON is read until a subcommand action fires.

This is achieved by making service constructors lazy (Option A) without changing the Commander command registration structure.

---

## 8. Performance Targets

| Scenario | Before | After |
|---|---|---|
| `n8nac --help` | ~5-10s (load all assets) | <100ms (no assets) |
| `n8nac list` | ~5-10s | <100ms |
| `n8nac skills search "foo"` | ~5-10s (first time) | ~5-10s (first time), instant (cached in-process) |
| `n8nac skills search "bar"` (same process) | — | instant |

---

## 9. Open Questions

1. **Should `n8nac --help` show `skills` subcommands?** If yes, the command tree must be registered before `program.parse()`. If no, we can make the entire `skills` command lazy. Most CLI tools show all subcommands in help, so we should aim to preserve this.

2. **Should we split `skills-commander.ts` into per-command modules?** This is cleaner long-term and enables true per-command lazy loading, but is a larger refactor. Worth doing in a separate PR.

3. **Should FlexSearch index be built once and cached in memory?** Yes, after first load. The `KnowledgeSearch` class already keeps the FlexSearch index in memory after `loadIndex()` — we just need to prevent that call from happening at startup.

4. **Should we use a .json cache for the parsed objects** (vs. re-parsing on every first-invocation)? The JSON files are already the serialized form; re-parsing is unavoidable. But we could use `require()` caching by writing a temp `.js` file that exports the parsed data — not worth the complexity.

---

## 10. Implementation Plan

### Phase 1 (This PR): Service-Level Lazy Loading

- Modify `NodeSchemaProvider` constructor to be lazy (`ensureLoaded()`)
- Modify `DocsProvider` constructor to be lazy
- Modify `KnowledgeSearch` constructor to be lazy
- Modify `AiContextGenerator` if applicable
- **Minimal changes** to `skills-commander.ts` and `index.ts`

**Expected result**: `n8nac --help` becomes instant. `n8nac skills *` still loads assets on first invocation.

### Phase 2 (Future PR): Per-Command Lazy Imports

- Split `skills-commander.ts` into `skills-commands/*.ts`
- Use Commander's lazy action pattern: `.action(() => import(...))`
- `n8nac --help` shows skills commands (registered eagerly), but assets load only on first `skills *` invocation

### Phase 3 (Future PR): Persistent Cache

- Investigate using `require()` cache or a binary format for the node schema index to reduce parse overhead on first load
