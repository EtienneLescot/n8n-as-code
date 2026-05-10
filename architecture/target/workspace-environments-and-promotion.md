# Target Architecture: Workspace Environments And Workflow Promotion

- **Status**: Product and technical specification
- **Scope**: n8nac workspace environment model, explicit environment targeting, and workflow promotion between environments
- **Decision**: Replace direct instance targeting in the n8nac product model with workspace environments. An environment is created by attaching an existing instance target, one n8n project, and one sync folder. Instance targets can be global n8n-manager references or workspace-tracked non-secret public descriptors. Do not keep `--instance` as a product concept in this spec.

---

## 0. MVP Contract And Normative Scope

This document describes the target architecture, but the first implementation must use the following MVP contract as the review baseline.

MVP requirements:

- v4 workspace config is owned by n8nac `ConfigService`; n8n-manager-core remains the owner of global instances, runtime state, and global secrets.
- persisted v4 environments must reference persisted workspace `instanceTargets[].id`; direct global instance IDs may be accepted as command input only if the command first creates a `global-ref` workspace target.
- v4 sync-capable commands must resolve through an explicit or pinned environment; if v4 resolution fails, commands must not fall back to legacy workspace settings, `N8N_HOST`, or generic `N8N_API_KEY`.
- scoped environment or target API key variables are MVP; workspace-local ignored secret files are later unless separately specified.
- every persisted environment `syncFolder` is an environment root, resolved relative to the workspace root unless absolute paths are explicitly allowed by the implementation; two environments must not use the same resolved sync-folder path.
- `workflowDir` is computed from `syncFolder`, instance identifier, and project slug; users do not edit final `workflowDir` directly.
- removing an active environment must not auto-pin another environment; it must either fail or clear `activeEnvironmentId` with explicit user intent.
- promotion MVP supports path-based promotion with `--from` and `--to`, preserves target workflow ID when replacing an existing target file, strips source IDs for new target files, rewrites target project metadata, and pushes by default.
- promotion MVP includes `--dry-run`, `--no-push`, and `--overwrite` as safety controls if implemented; they are not considered future-only once exposed in the CLI.
- access status is diagnostic only in MVP. Offline snapshots may report credential availability and `unknown`; commands surface remote permission failures as environment access diagnostics rather than trying to fully preflight every permission.

Later/non-MVP unless explicitly implemented:

- first-class workspace-local secret file management;
- workflow ID/name fuzzy promotion;
- logical deployment keys;
- full project/workflow permission probing for every environment;
- automatic credential or permission repair.

## 1. Executive Summary

n8n-as-code should introduce a workspace-level **Environment** abstraction.

An environment is a named workspace target composed of:

- an existing instance target, either by global reference or workspace-tracked non-secret descriptor;
- an n8n project for that instance;
- a dedicated physical sync folder;
- optional workflow settings such as `folderSync` and `customNodesPath`.

This gives a deliberate two-step product model:

1. create or register an instance target;
2. create an environment by attaching that instance target, one of its projects, and a sync folder.

Users can create as many environments as they want in a workspace:

```text
Global instances, owned by n8n-manager:
- managedA
- managedB
- cloudA
- cloudB

Workspace instance targets, owned by n8nac:
- managedA-link = ref(managedA)
- staging-n8n   = embedded https://staging-n8n.example.com
- prod-n8n      = embedded https://prod-n8n.example.com

Workspace environments, owned by n8nac:
- Dev     = managedA-link + project Personal + workflows/dev
- Staging = staging-n8n   + project Personal + workflows/staging
- Prod    = prod-n8n      + project CGI      + workflows/prod
```

The user pins one environment as the default working environment. Commands run against that pinned environment unless another environment is explicitly selected.

n8nac should also provide commands to exchange or promote workflows between environments.

The short-term architecture stays intentionally robust:

```text
1 environment = 1 existing instance target + 1 n8n project + 1 physical sync path
```

Promotion is explicit and controlled. It copies/applies a workflow from one environment scope to another, then pushes to the target environment. It is not a magical multi-environment sync folder.

---

## 2. Product Specification

### 2.1 User Mental Model

The user should think in terms of **environments**, not raw instances.

A raw instance is incomplete for workflow work because it does not include:

- which n8n project to use;
- where local workflow files live;
- which `.n8n-state.json` belongs to that remote target;
- which remote workflow IDs apply;
- which credentials are available;
- which conflict state applies.

An environment bundles an already-defined instance target, a project, and a sync folder into a coherent workspace target.

The instance target attached to an environment has two valid shapes:

- **global reference** for machine-owned instances, especially managed/local Docker instances whose runtime details are not portable;
- **embedded public descriptor** for shared existing instances whose URL should be tracked in Git.

Secrets are never part of the environment definition.

### 2.2 Product Promise

n8n-as-code lets users:

- register multiple n8n instances globally via n8n-manager;
- define workspace instance targets that either reference global instances or embed public instance descriptors;
- define workspace-specific environments by attaching an instance target to a project and sync folder;
- choose a default environment for day-to-day work;
- run normal sync commands against any environment;
- promote workflows explicitly between environments.

### 2.3 Example Narrative

A user first has three instance targets:

```text
Local Dev instance -> global ref to local managed n8n
Staging instance   -> embedded public URL
Production instance -> embedded public URL
```

Then the user creates three environments by attaching those instance targets to projects and sync folders:

```text
Dev     -> Local Dev instance + Personal project + workflows/dev
Staging -> Staging instance   + Personal project + workflows/staging
Prod    -> Production instance + CGI project      + workflows/prod
```

The user works by default in Dev:

```bash
n8nac env pin Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/invoice-reminder.workflow.ts
```

When ready, the user promotes to Production:

```bash
n8nac promote workflows/dev/invoice-reminder.workflow.ts --from Dev --to Prod
```

The command copies/adapts the workflow into the Prod sync scope, pushes it to the Prod instance/project, and records Prod-specific sync state.

### 2.4 Product Principles

1. **Environment is the user-facing target**

Users deploy to `Prod`, not to `cloudA`.

2. **Global instances remain machine-owned runtime/auth objects**

n8n-manager owns machine-level instances, API keys, Docker/runtime state, tunnels, and project discovery. Managed/local instances should usually be referenced by environments, not copied into workspace config.

3. **Environments are workspace-local and portable**

The same global instance may be used by multiple workspaces with different project/sync settings. A workspace may also carry a public, non-secret descriptor for shared team instances so a cloned repo works without pre-created global instance IDs.

4. **Every environment has its own physical sync scope**

This avoids mixing workflow IDs, project IDs, state files, remote caches, and conflicts.

5. **Promotion is explicit**

Promotion is a deployment-like action between environments, not background sync.

6. **No mandatory dev/staging/prod pipeline**

Users may create any number of environments with arbitrary names.

7. **Multiple source-of-truth patterns are allowed**

A user may sync with Dev, Prod, or any environment. n8nac should not force one canonical source folder yet.

8. **The product vocabulary should not expose direct instance targeting in n8nac**

Direct instance selection is the wrong abstraction for workflow sync and deployment.

9. **Secrets and access rights are user-local concerns**

Workspace environments may describe where an instance is and which project to use, but API keys, tokens, owner credentials, OAuth secrets, and permission grants remain local/user-managed and must not be committed.

### 2.5 Non-Goals

- Do not introduce a mandatory “project/app/pipeline” abstraction above environments.
- Do not introduce a single canonical source folder in the first implementation.
- Do not pretend n8n has a native dev-to-prod merge model.
- Do not make credentials portable automatically.
- Do not store API keys, owner credentials, OAuth secrets, tokens, or runtime passwords in tracked workspace config.
- Do not assume two engineers have the same permissions on the same shared instance.
- Do not make one sync folder target multiple environments.
- Do not keep `--instance` as part of the n8nac product model.

---

## 3. User-Facing UX

### 3.1 Environment Management

The UX is intentionally two-step. First, an instance target exists. Then an environment attaches that instance target, one project, and one sync folder.

Indicative instance target commands:

```bash
# Machine/global instance, created by n8n-manager as today.
n8n-manager instances create managedA --mode managed-local
n8n-manager instances add personalCloud --url https://personal-n8n.example.com

# Workspace-tracked public instance target, stored without secrets in n8nac-config.json.
n8nac instance-target add staging-n8n --base-url https://staging-n8n.example.com
n8nac instance-target add prod-n8n --base-url https://prod-n8n.example.com
```

The exact command names can change during implementation. The product invariant is stable: environment creation consumes an existing instance target; it does not primarily create an instance inline.

Preferred environment command group:

```bash
n8nac env list
n8nac env status
n8nac env add Dev --instance-target managedA --project-id personal --project-name Personal --sync-folder workflows/dev
n8nac env add Staging --instance-target staging-n8n --project-id personal --project-name Personal --sync-folder workflows/staging
n8nac env add Prod --instance-target prod-n8n --project-id cgi --project-name CGI --sync-folder workflows/prod
n8nac env pin Dev
n8nac env update Prod --project-id cgi --project-name CGI
n8nac env remove Staging
```

Two instance target creation modes are supported before environment creation:

```bash
# Machine-owned managed/local instance: store a global reference only.
n8n-manager instances create managedA --mode managed-local
n8nac env add Dev --instance-target managedA --project-id personal --project-name Personal --sync-folder workflows/dev

# Shared existing/public instance: store a portable non-secret descriptor in the repo.
n8nac instance-target add prod-n8n --base-url https://prod-n8n.example.com
n8nac env add Prod --instance-target prod-n8n --project-id cgi --project-name CGI --sync-folder workflows/prod
```

The CLI must reject environment creation commands that provide both an instance target and inline instance creation flags. A later convenience shortcut may combine the two steps, but it must still persist an instance target first and then attach it to the environment.

`environment` can be provided as a long alias for discoverability:

```bash
n8nac environment list
n8nac environment pin Prod
```

Environment lifecycle semantics:

- `env add` creates an environment mapping only; it does not create a global n8n-manager instance or remote n8n project.
- `env update` changes the environment mapping only; it does not mutate the attached instance target unless an explicit target command is used.
- `env pin` validates that the environment exists. It does not require credentials or remote access.
- `env remove` removes only the environment mapping. It never deletes workspace instance targets, global n8n-manager instances, remote n8n projects, remote workflows, local workflow files, or sync state files.
- Removing the active environment must not silently pin another environment. The CLI/UI should either fail and ask the user to pin a replacement first, or clear `activeEnvironmentId` with explicit confirmation.
- If `activeEnvironmentId` references a missing environment in a malformed config, sync-capable commands should fail with setup guidance; status/list commands may show a stale-pin warning.

### 3.2 Running Commands Against An Environment

Default pinned environment:

```bash
n8nac env pin Dev
n8nac list
n8nac pull <workflow-id>
n8nac push workflows/dev/my.workflow.ts
```

One-off explicit environment:

```bash
n8nac --env Prod list
n8nac --env Prod verify <workflow-id>
n8nac --env Prod execution list --workflow-id <workflow-id> --json
```

Credentials are deliberately separate from these commands. If an environment is attached to an embedded public instance target, each engineer still provides their own API key through environment variables, a local ignored secrets file, or the global n8n-manager secret store.

### 3.3 Promotion

Minimal MVP command:

```bash
n8nac promote <source-workflow-path> --from Dev --to Prod
```

Example:

```bash
n8nac promote workflows/dev/invoice-reminder.workflow.ts --from Dev --to Prod
```

The command should:

1. resolve source environment;
2. resolve target environment;
3. validate that the source workflow path belongs to the source sync scope;
4. derive the target path under the target sync scope;
5. preserve target workflow ID if the target file already exists;
6. strip source-only remote identifiers when creating a new target workflow;
7. rewrite project metadata to target project;
8. write/update target local workflow file;
9. push target workflow to target remote;
10. update target sync state.

### 3.4 Promotion Safety Flags

The MVP may expose these safety flags when implemented with the path-based promotion command:

```bash
n8nac promote <path> --from Dev --to Prod --dry-run
n8nac promote <path> --from Dev --to Prod --no-push
n8nac promote <path> --from Dev --to Prod --overwrite
```

Semantics:

- `--dry-run` resolves both environments and target paths, but does not write or push.
- `--no-push` writes/adapts the target local workflow file, but does not push to the target remote.
- `--overwrite` is required when the derived target workflow file already exists, unless the command is a dry run.

Later additions:

```bash
n8nac promote <workflow-id-or-name> --from Dev --to Prod
n8nac promote <path> --to Prod
```

These should be deferred until path-based MVP behavior is safe and well-tested.

---

## 4. Current Architecture Mapping

### 4.1 Current Global Instance Ownership

Current code uses `@n8n-as-code/n8n-manager-core` through `ConfigService` and `manager-adapter`.

Relevant files:

- `packages/cli/src/services/config-service.ts`
- `packages/manager-adapter/src/index.ts`
- `node_modules/@n8n-as-code/n8n-manager-core/dist/configuration-service.d.ts`
- `node_modules/@n8n-as-code/n8n-manager-core/dist/configuration-service.js`

Current n8n-manager workspace override type:

```ts
export interface N8nWorkspaceOverrides {
    version: 3;
    activeInstanceId?: string;
    syncFolder?: string;
    projectId?: string;
    projectName?: string;
    folderSync?: boolean;
    customNodesPath?: string;
}
```

Current resolution in n8n-manager-core:

```ts
const requestedInstanceId = cleanString(input.instanceId);
const workspaceInstanceId = cleanString(workspace.activeInstanceId);
const globalInstanceId = cleanString(globalConfig.activeInstanceId);
const activeInstanceId = requestedInstanceId ?? workspaceInstanceId ?? globalInstanceId;
```

Current limitation:

- `instanceId` can be explicit;
- workspace project and sync settings are still global to the workspace;
- targeting a different instance does not carry a different workspace project/sync folder.

This is the main reason to introduce environments.

### 4.2 Current CLI Instance Targeting

Relevant file:

- `packages/cli/src/index.ts`

Current global option:

```ts
program.option('--instance <name>', 'Target a specific global n8n-manager instance by name instead of the effective one');
```

It is injected into process env:

```ts
process.env.N8NAC_INSTANCE_NAME = globalInstance;
```

Relevant file:

- `packages/cli/src/commands/base.ts`

`BaseCommand` reads:

```ts
const requestedInstanceName = process.env.N8NAC_INSTANCE_NAME?.trim() || undefined;
```

It resolves instance by name and sets:

```ts
this.activeInstanceId = match.id;
```

Current limitation:

- this targets an instance by name;
- it does not target an environment;
- it cannot safely represent per-target project/sync settings.

Specification decision:

- remove this from the n8nac product model;
- replace with `--env <name>` and environment resolution.

### 4.3 Current Workspace Commands

Relevant file:

- `packages/cli/src/index.ts`

Current commands:

```bash
n8nac workspace status
n8nac workspace pin-instance --instance-id <id>
n8nac workspace clear-instance
n8nac workspace set-sync-folder <path>
n8nac workspace clear-sync-folder
n8nac workspace set-project --project-id <id> --project-name <name>
n8nac workspace clear-project
```

These commands operate on workspace-level singleton fields.

Environment architecture changes the model from singleton fields to named environment entries.

New command group should become the main UX:

```bash
n8nac env ...
```

Workspace commands may still exist for other workspace concerns, but instance/project/sync targeting should move to `env`.

### 4.4 Current ConfigService Responsibilities

Relevant file:

- `packages/cli/src/services/config-service.ts`

Current methods directly impacted:

```ts
getLocalConfig()
getWorkspaceConfig()
listInstances()
getEffectiveInstanceConfig(instanceId?)
getEffectiveContext(instanceId?)
prepareWorkspaceContext(instanceId?)
getActiveInstanceId()
pinWorkspaceInstance(instanceId)
clearWorkspaceInstanceOverride()
setWorkspaceSyncFolder(syncFolder)
setWorkspaceProject(project)
clearWorkspaceProjectOverride()
resolveWorkspaceContext(instanceId?)
contextToInstanceProfile(context)
contextToLocalConfig(context)
buildWorkflowDir(syncFolder, instanceIdentifier, projectName)
```

Current important computed path:

```ts
workflowDir = path.join(syncFolder, instanceIdentifier, createProjectSlug(projectName))
```

Environment model should preserve the idea that final `workflowDir` is computed and not manually edited by users unless an explicit advanced override exists.

### 4.5 Current BaseCommand Flow

Relevant file:

- `packages/cli/src/commands/base.ts`

Current flow:

1. constructor creates `ConfigService`;
2. constructor resolves host/API key/sync folder from env or effective context;
3. runtime preparation happens lazily through `prepareRuntimeContext()`;
4. sync config is produced by `getSyncConfig()`;
5. sync commands construct `SyncManager(this.client, syncConfig)`.

Environment model should change `BaseCommand` from:

```ts
activeInstanceId?: string
```

to a richer target:

```ts
activeEnvironmentId?: string
activeEnvironmentName?: string
activeInstanceId?: string
```

`prepareRuntimeContext()` should prepare the selected environment, not only selected instance.

### 4.6 Current Sync State Isolation

Relevant files:

- `packages/cli/src/core/services/sync-manager.ts`
- `packages/cli/src/core/services/state-manager.ts`
- `packages/cli/src/core/services/sync-event-journal.ts`
- `packages/cli/src/core/services/workflow-state-tracker.ts`
- `packages/cli/src/core/services/sync-engine.ts`

Current `SyncManager.ensureInitialized()` computes instance directory:

```ts
const instanceDir = this.config.workflowDir
    ? path.normalize(this.config.workflowDir)
    : path.join(
        this.config.directory,
        this.config.instanceIdentifier || 'default',
        createProjectSlug(this.config.projectName),
    );
```

Inside `instanceDir`, the sync engine stores:

- workflow files;
- `.n8n-state.json`;
- `.n8n-sync-events.jsonl`;
- TypeScript stubs and `tsconfig.json`.

This already supports environment isolation if each environment resolves to a distinct `workflowDir`.

The environment feature should rely on this invariant rather than inventing new sync-state paths.

---

## 5. Proposed Data Model

### 5.1 Workspace Config Version

Introduce workspace config version 4.

Current v3:

```json
{
  "version": 3,
  "activeInstanceId": "test",
  "syncFolder": "workflows-test",
  "projectId": "project-test",
  "projectName": "Test Project"
}
```

Proposed v4:

```json
{
  "version": 4,
  "activeEnvironmentId": "dev",
  "instanceTargets": [
    {
      "id": "managedA",
      "name": "Local Managed A",
      "kind": "global-ref",
      "instanceRef": "managedA"
    },
    {
      "id": "staging-n8n",
      "name": "Staging n8n",
      "kind": "embedded",
      "instance": {
        "mode": "existing",
        "baseUrl": "https://staging-n8n.example.com"
      }
    },
    {
      "id": "prod-n8n",
      "name": "Production n8n",
      "kind": "embedded",
      "instance": {
        "mode": "existing",
        "baseUrl": "https://prod-n8n.example.com"
      }
    }
  ],
  "environments": [
    {
      "id": "dev",
      "name": "Dev",
      "instanceTargetId": "managedA",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/dev"
    },
    {
      "id": "staging",
      "name": "Staging",
      "instanceTargetId": "staging-n8n",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/staging"
    },
    {
      "id": "prod",
      "name": "Prod",
      "instanceTargetId": "prod-n8n",
      "projectId": "cgi",
      "projectName": "CGI",
      "syncFolder": "workflows/prod"
    }
  ]
}
```

### 5.2 Why Array Instead Of Object Map

Use an array rather than an object map because it allows:

- stable machine ID and user-facing name;
- ordering in UI;
- future metadata per environment;
- easier rename without changing identity;
- duplicate-name validation with explicit errors.

### 5.3 TypeScript Interfaces

Add n8nac-side interfaces first:

```ts
export type N8nWorkspaceInstanceTarget =
    | IN8nWorkspaceGlobalInstanceTarget
    | IN8nWorkspaceEmbeddedInstanceTarget;

export interface IN8nWorkspaceGlobalInstanceTarget {
    id: string;
    name: string;
    kind: 'global-ref';
    instanceRef: string;
    description?: string;
}

export interface IN8nWorkspaceEmbeddedInstanceTarget {
    id: string;
    name: string;
    kind: 'embedded';
    instance: IN8nWorkspaceEmbeddedInstance;
    description?: string;
}

export interface IN8nWorkspaceEmbeddedInstance {
    mode: 'existing';
    baseUrl: string;
    name?: string;
    instanceIdentifier?: string;
    verification?: {
        status: 'unverified' | 'verified' | 'failed';
        normalizedHost?: string;
        userId?: string;
        userName?: string;
        userEmail?: string;
        lastCheckedAt?: string;
        lastError?: string;
    };
}

export interface IN8nWorkspaceEnvironment {
    id: string;
    name: string;
    instanceTargetId: string;
    projectId?: string;
    projectName?: string;
    syncFolder: string;
    folderSync?: boolean;
    customNodesPath?: string;
    description?: string;
}

export interface IWorkspaceConfigV4 {
    version: 4;
    activeEnvironmentId?: string;
    instanceTargets: N8nWorkspaceInstanceTarget[];
    environments: IN8nWorkspaceEnvironment[];
}

export type IWorkspaceConfig = IWorkspaceConfigV3 | IWorkspaceConfigV4;
```

Current `IWorkspaceConfig` in `packages/cli/src/services/config-service.ts` is v3-only:

```ts
export interface IWorkspaceConfig extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
    instances: IInstanceProfile[];
}
```

Validation rules:

- every environment must reference exactly one `instanceTargetId`;
- every `instanceTargetId` must resolve to a workspace instance target or a global instance target exposed as a target;
- global-ref targets point to global n8n-manager instances on the current machine;
- embedded targets are tracked, non-secret descriptors and must not contain API keys or owner credentials;
- embedded target `instance.mode` is initially limited to `existing`; managed/local runtimes should be references, not embedded descriptors;
- `syncFolder` is required for every environment;
- instance target `id` and `name` must be unique within the workspace, with name uniqueness checked case-insensitively;
- environment `id` and `name` must be unique within the workspace, with name uniqueness checked case-insensitively.

This needs to become a UI/effective snapshot type, not a direct persisted config type.

Recommended split:

```ts
export interface IPersistedWorkspaceConfigV3 extends ILocalConfig {
    version: 3;
    activeInstanceId?: string;
}

export interface IPersistedWorkspaceConfigV4 {
    version: 4;
    activeEnvironmentId?: string;
    instanceTargets: N8nWorkspaceInstanceTarget[];
    environments: IN8nWorkspaceEnvironment[];
}

export interface IEffectiveWorkspaceSnapshot extends ILocalConfig {
    version: 4;
    activeEnvironmentId?: string;
    activeInstanceId?: string;
    activeEnvironment?: IN8nWorkspaceEnvironment;
    instanceTargets: N8nWorkspaceInstanceTarget[];
    environments: IN8nWorkspaceEnvironment[];
    instances: IInstanceProfile[];
}
```

The effective snapshot should also expose whether the environment’s attached instance target is a global reference or an embedded descriptor:

```ts
export interface IEffectiveEnvironmentSnapshot extends IN8nWorkspaceEnvironment {
    targetKind: 'global-ref' | 'embedded';
    instanceTargetId: string;
    instanceTargetName: string;
    instanceId?: string;
    instanceName?: string;
    baseUrl?: string;
    apiKeyAvailable: boolean;
    credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
    workflowDir?: string;
}
```

### 5.4 Environment Resolution Result

Add an explicit resolved environment context:

```ts
export interface IResolvedWorkspaceEnvironment extends ILocalConfig {
    environment: IN8nWorkspaceEnvironment;
    instanceTarget: N8nWorkspaceInstanceTarget;
    environmentId: string;
    environmentName: string;
    instanceTargetId: string;
    instanceTargetName: string;
    activeInstanceId?: string;
    activeInstanceName: string;
    instance: IInstanceProfile | IN8nWorkspaceEmbeddedInstance;
    targetKind: 'global-ref' | 'embedded';
    globalInstanceId?: string;
    host: string;
    apiKey?: string;
    apiKeySource?: 'env' | 'workspace-local' | 'global' | 'missing';
    apiBaseUrl?: string;
    publicBaseUrl?: string;
    instanceIdentifier?: string;
    syncFolder: string;
    workflowDir?: string;
    projectId?: string;
    projectName?: string;
    folderSync: boolean;
    customNodesPath?: string;
    sources: {
        environment: 'explicit' | 'workspace-default' | 'legacy' | 'global-fallback';
        instance: 'global-ref' | 'embedded';
        project: 'environment' | 'instance-default' | 'missing';
        syncFolder: 'environment';
    };
}
```

### 5.5 Instance Target Variants

There are two intentionally different instance target variants.

#### Global Reference

Use `instanceRef` when the instance is machine-owned or managed by n8n-manager:

```json
{
  "id": "managed-local-dev-target",
  "name": "Managed Local Dev",
  "kind": "global-ref",
  "instanceRef": "managed-local-dev",
}
```

This is the correct shape for managed/local instances because their runtime details are machine-specific:

- local ports can differ;
- Docker container names can differ;
- Docker volume names can differ;
- runtime state paths are local;
- tunnel URLs can rotate;
- owner bootstrap credentials are local;
- the instance may not exist on another engineer’s machine.

#### Embedded Descriptor

Use `instance` when the instance is an existing shared/public n8n endpoint whose non-secret connection metadata should be tracked with the repository:

```json
{
  "id": "prod-n8n",
  "name": "Production n8n",
  "kind": "embedded",
  "instance": {
    "mode": "existing",
    "baseUrl": "https://prod-n8n.example.com"
  }
}
```

This is the correct shape for team/shared environments because another engineer can clone the repo and immediately discover the public target and project mapping. They still need their own API key.

An environment then attaches the target to a project and sync folder:

```json
{
  "id": "prod",
  "name": "Prod",
  "instanceTargetId": "prod-n8n",
  "projectId": "cgi",
  "projectName": "CGI",
  "syncFolder": "workflows/prod"
}
```

### 5.6 Fields That Must Never Be Tracked

Tracked workspace config must never contain:

- API keys;
- owner email/password for managed local n8n;
- OAuth client secrets;
- credential values;
- session cookies;
- generated bearer tokens;
- local Docker runtime paths;
- tunnel process metadata;
- transient health/runtime status.

If these values are needed, they belong in user-managed local secret storage, environment variables, or ignored files.

---

## 6. Configuration Ownership

### 6.1 Global Instance Store Remains In n8n-manager

No change in principle:

- global instance list;
- active global instance;
- API keys;
- runtime state;
- managed Docker lifecycle;
- tunnels;
- default project per instance.

Global instances remain the right home for machine-owned configuration. This includes managed Docker instances, local direct instances, personal sandboxes, and any shortcut the user wants available across many workspaces.

Workspace environments may reference these global instances, but should not copy managed runtime details into Git.

### 6.2 Workspace Environments Live In n8nac Workspace Config

The workspace file remains `n8nac-config.json`, but schema becomes v4.

Workspace instance targets can carry either:

- `instanceRef`, which links to a global machine-owned n8n-manager instance;
- `instance`, which embeds a portable public descriptor for an existing shared instance.

Workspace environments reference these instance targets through `instanceTargetId`, then add project and sync-folder settings. This means the workspace file can be tracked in Git for team/public instances without requiring every engineer to create matching global instance IDs first.

Important current technical constraint:

`ConfigService` currently delegates workspace config read/write to `N8nConfigurationService.readWorkspaceOverrides()` and `writeWorkspaceOverrides()` from `@n8n-as-code/n8n-manager-core`.

That service currently sanitizes workspace overrides to v3 fields. Therefore, implementation must choose one of two paths:

### Option A: Update `@n8n-as-code/n8n-manager-core` To Support v4 Environments

Pros:

- consistent read/write path across CLI, adapter, and VS Code;
- existing `manager-adapter` facade can expose v4 workspace data;
- less duplicate parsing logic.

Cons:

- requires coordinated release of n8n-manager-core;
- n8n-manager-core starts knowing about n8nac-specific environments.

### Option B: Move Environment Persistence Into n8nac `ConfigService`

Pros:

- keeps n8n-manager-core focused on global instance/runtime concerns;
- environments are clearly an n8nac workspace concern;
- faster implementation inside this repo.

Cons:

- `ConfigService` must parse/write `n8nac-config.json` directly for v4;
- `manager-adapter` and VS Code code paths need alignment;
- two services may touch the same config file unless carefully separated.

Recommended approach:

- Implement n8nac-side parsing/writing for v4 environments in `ConfigService`.
- Continue using `N8nConfigurationService` for global instance list, secrets, runtime preparation, and v3 fallback resolution.
- Use n8n-manager runtime orchestration only for environments whose instance target is `kind: 'global-ref'` and resolves to a global instance.
- For environments whose instance target is `kind: 'embedded'`, construct the API context from the target `baseUrl` plus locally resolved credentials.
- Update `manager-adapter` only where VS Code needs environment snapshots.
- Later decide whether to upstream generic v4 awareness to n8n-manager-core.

Reason:

Environments are a workspace/product concept of n8nac. n8n-manager should not be forced to own workflow sync topology, and it should not be required to store public shared instance descriptors globally before a repository can be used.

---

## 7. Resolution Semantics

### 7.1 Resolution Order

When a command needs an effective target:

1. explicit `--env <name-or-id>`;
2. workspace `activeEnvironmentId`;
3. if no v4 environments exist, v3 legacy fields as an implicit environment;
4. global active instance fallback only for generation-light commands that do not require sync;
5. otherwise fail with actionable setup guidance.

For v4 workspaces, failed environment resolution is terminal for sync-capable commands. Do not recover by reading legacy workspace singleton fields, VS Code legacy settings, `N8N_HOST`, or generic `N8N_API_KEY`.

### 7.2 Explicit Environment Lookup

Environment names should be resolved by:

1. exact `id` match;
2. exact case-insensitive `name` match;
3. fail if no match;
4. fail if name is ambiguous.

Because v4 uses unique IDs, ambiguity should only be possible if duplicate names are allowed. Prefer enforcing unique names too.

### 7.2.1 Instance Target Lookup

Environment resolution first resolves `environment.instanceTargetId`.

Lookup order:

1. workspace `instanceTargets[].id` exact match;
2. workspace `instanceTargets[].name` exact case-insensitive match, if a command accepts names;
3. fail with an actionable error.

Persisted environments must always reference workspace instance target IDs. If the user attaches a global instance directly in the UI or CLI, that command should create a workspace `kind: 'global-ref'` instance target first, then create the environment pointing to that target. `resolveEnvironment()` must not silently resolve a missing persisted `instanceTargetId` against global n8n-manager instances.

### 7.3 Project Resolution

For an environment:

```ts
projectId = environment.projectId ?? resolvedGlobalInstance?.defaultProject?.id
projectName = environment.projectName ?? resolvedGlobalInstance?.defaultProject?.name
```

Embedded descriptors do not have a reliable machine-local `defaultProject` unless the workspace config stores it. Therefore, embedded environments should normally carry `projectId` and `projectName` explicitly.

For sync commands, missing project should remain an error unless the instance is a self-hosted n8n without projects API and user explicitly uses `personal`.

Current error in `BaseCommand.getSyncConfig()`:

```ts
Missing required project configuration: projectId, projectName, syncFolder.
```

This should become environment-aware:

```text
Environment "Prod" is missing project configuration.
Set it with:
  n8nac env update Prod --project-id <id> --project-name <name>
```

### 7.4 Sync Folder Resolution

Environment sync folder is required.

It should be resolved relative to workspace root unless absolute:

```ts
syncFolder = path.isAbsolute(env.syncFolder)
    ? env.syncFolder
    : path.resolve(workspaceRoot, env.syncFolder)
```

Final workflow directory remains computed using instance identity and project slug:

```ts
workflowDir = path.join(
    resolvedSyncFolder,
    instanceIdentifier,
    createProjectSlug(projectName),
)
```

This preserves current isolation behavior and gives each environment a physical sync scope.

MVP validation should reject two environments that use the same resolved sync-folder path. If the implementation supports absolute paths or existing symlinks, collision checks should compare canonical real paths where available. A stricter implementation may also reject nested sync folders such as `workflows` and `workflows/prod` to avoid accidental overlapping sync state.

Example:

```text
workflows/dev/n8n_f85ac825d1/personal/
workflows/prod/n8n_1bfdd27c80/cgi/
```

### 7.5 Instance Identifier

Current `ConfigService` only exposes canonical identifiers:

```ts
private canonicalInstanceIdentifier(identifier?: string): string | undefined {
    return isCanonicalUserInstanceIdentifier(identifier) ? identifier : undefined;
}
```

For environments, the instance identifier still belongs to the global instance, not the environment.

If missing, existing `getOrCreateInstanceIdentifier(host, instanceId)` behavior can remain, but called with the environment’s instance ID.

For embedded descriptors, there may be no stable global `instanceId`. In that case, the identifier should be resolved from the local API key and cached only if the cache is local/ignored. The tracked environment may store `instance.instanceIdentifier` only if it is a non-secret stable user/instance identifier and the team explicitly accepts tracking it.

### 7.6 Instance Target Resolution

Resolution must branch by target kind.

For a resolved instance target with `kind: 'global-ref'`:

1. find the global n8n-manager instance by ID;
2. use n8n-manager runtime preparation for managed/local instances;
3. resolve URL from global instance runtime state, including tunnel/public URL if configured;
4. resolve API key from env/workspace-local/global secrets;
5. use global instance default project only when the environment does not specify one.

For a resolved instance target with `kind: 'embedded'`:

1. validate `mode: existing`;
2. use `instance.baseUrl` as the API base URL;
3. do not call managed runtime start/stop/tunnel logic;
4. resolve API key from scoped environment variables and, where safe, the global n8n-manager secret store using environment ID, target ID, or normalized base URL;
5. require `projectId` and `projectName` unless a later project discovery step explicitly fills them.

Target resolution output must include:

```ts
targetKind: 'global-ref' | 'embedded';
baseUrl: string;
apiKey?: string;
apiKeySource: 'env' | 'workspace-local' | 'global' | 'missing';
canManageRuntime: boolean;
```

`canManageRuntime` is true only for global references that resolve to managed instances.

### 7.7 Credentials Resolution

Credentials are outside the tracked environment definition. For v4 environments, n8nac should avoid using one generic API key for every environment; it should resolve API keys in this order:

1. explicit scoped environment variables, for example `N8NAC_ENV_PROD_API_KEY` or `N8NAC_TARGET_PROD_N8N_API_KEY`;
2. global n8n-manager secret store, where the environment target is a global reference or the embedded target can be matched safely by URL;
4. missing.

Workspace-local ignored secret files are not part of the MVP lookup order. This spec does not require n8nac to create or own a workspace-local secrets file, because secrets remain the user’s responsibility. If workspace-local secret lookup is added later, it must define exact file paths, schema, gitignore behavior, precedence, and malformed-file diagnostics.

Recommended ignored files if implemented later:

```text
.n8nac/secrets.local.json
.n8nac/*.secret.json
.n8n-manager/secrets.json
```

Example workspace-local secret shape if supported later:

```json
{
  "version": 1,
  "environmentApiKeys": {
    "dev": "...",
    "prod": "..."
  },
  "baseUrlApiKeys": {
    "https://prod-n8n.example.com": "..."
  }
}
```

The lookup must never write secrets automatically into tracked config. If a command receives an API key through stdin, it must clearly state where it stored it, or not store it at all.

### 7.8 Rights And Permissions Model

Environment portability does not imply permission portability.

Each engineer may have a different API key and therefore different n8n rights on the same embedded/public instance. n8nac must treat permission failures as environment access issues, not configuration corruption.

For workflow sync and promotion, the API key generally needs rights to:

- list workflows in the target project;
- read workflow details;
- create workflows;
- update workflows;
- activate/deactivate workflows when requested;
- read executions when using execution commands;
- list credentials metadata when checking required credentials;
- create/delete credentials only when explicitly using credential commands.

Promotion to another environment may fail because:

- the API key cannot access the target project;
- the project ID exists but the user is not a member;
- the workflow references credentials the user cannot see;
- the workflow references credentials that exist but are not shared with the target project;
- the key can create workflows but cannot activate them;
- the n8n instance version/API does not support the requested endpoint.

Commands should surface these as clear diagnostics:

```text
Environment "Prod" resolved, but your API key cannot access project "CGI".
Check your n8n project membership or provide a different local API key.
```

For VS Code and CLI status views, each environment should expose an access snapshot:

```ts
type EnvironmentAccessStatus =
    | 'ready'
    | 'missing-api-key'
    | 'invalid-api-key'
    | 'project-inaccessible'
    | 'insufficient-workflow-permissions'
    | 'runtime-unavailable'
    | 'unknown';
```

This lets the UI distinguish “configuration exists” from “current user can operate it”. MVP access snapshots are diagnostic only and are not a command-routing fallback. They must not be persisted in tracked workspace config. Offline views may report `missing-api-key`, `runtime-unavailable`, or `unknown` without probing n8n. Full `project-inaccessible` and `insufficient-workflow-permissions` reporting requires explicit online checks or surfaced API failures.

---

## 8. CLI Design

### 8.1 Global Option

Add:

```ts
program.option('--env <name>', 'Target a workspace environment by name or ID');
```

Do not include direct instance targeting in the product UX.

Implementation can initially mirror the current env-var bridge pattern for minimal churn:

```ts
process.env.N8NAC_ENVIRONMENT = selectedEnv;
```

But preferred medium-term implementation is passing command context explicitly rather than using process env.

### 8.2 Top-Level Command Parsing Impact

Current helper `getFirstPositionalToken()` skips `--instance`:

```ts
if (token === '--instance') {
    index += 1;
    continue;
}

if (token.startsWith('--instance=')) {
    continue;
}
```

Update it to skip `--env`:

```ts
if (token === '--env' || token === '--environment') {
    index += 1;
    continue;
}

if (token.startsWith('--env=') || token.startsWith('--environment=')) {
    continue;
}
```

This matters for lazy `skills` help behavior and global option parsing.

### 8.3 New Commands

Add command group in `packages/cli/src/index.ts` or a new command module.

Recommended module:

```text
packages/cli/src/commands/environment.ts
```

Methods:

```ts
class EnvironmentCommand {
    list(options: { json?: boolean }): void;
    status(options: { json?: boolean }): void;
    add(name: string, options: AddEnvironmentOptions): void;
    update(nameOrId: string, options: UpdateEnvironmentOptions): void;
    pin(nameOrId: string, options: { json?: boolean }): void;
    remove(nameOrId: string, options: { json?: boolean; force?: boolean }): void;
}
```

CLI shape:

```bash
n8nac env list [--json]
n8nac env status [--json]
n8nac instance-target list [--json]
n8nac instance-target add <name> --instance-ref <global-instance-id> [--json]
n8nac instance-target add <name> --base-url <url> [--json]
n8nac env add <name> --instance-target <target-id-or-name> --project-id <id> --project-name <name> --sync-folder <path> [--json]
n8nac env update <name-or-id> [--instance-target <target-id-or-name>] [--project-id <id>] [--project-name <name>] [--sync-folder <path>] [--json]
n8nac env pin <name-or-id> [--json]
n8nac env remove <name-or-id> [--force] [--json]
```

### 8.4 Command Output

`n8nac env list` should show:

```text
Active  Environment  Target Kind  Target                    Project   Sync Folder
*       Dev          global-ref   managedA                  Personal  workflows/dev
        Staging      embedded     https://staging-n8n...    Personal  workflows/staging
        Prod         embedded     https://prod-n8n...       CGI       workflows/prod
```

JSON output should include resolved instance display info:

```json
{
  "activeEnvironmentId": "dev",
  "environments": [
    {
      "id": "dev",
      "name": "Dev",
      "targetKind": "global-ref",
      "instanceTargetId": "managedA",
      "instanceTargetName": "Local Managed A",
      "instanceName": "Local Dev",
      "projectId": "personal",
      "projectName": "Personal",
      "syncFolder": "workflows/dev",
      "workflowDir": "/repo/workflows/dev/n8n_xxx/personal",
      "apiKeyAvailable": true,
      "credentialSource": "global"
    },
    {
      "id": "prod",
      "name": "Prod",
      "targetKind": "embedded",
      "instanceTargetId": "prod-n8n",
      "instanceTargetName": "Production n8n",
      "baseUrl": "https://prod-n8n.example.com",
      "projectId": "cgi",
      "projectName": "CGI",
      "syncFolder": "workflows/prod",
      "workflowDir": "/repo/workflows/prod/n8n_yyy/cgi",
      "apiKeyAvailable": false,
      "credentialSource": "missing"
    }
  ]
}
```

### 8.5 Existing Workspace Commands

Current commands that set singleton targeting become conceptually obsolete:

```bash
n8nac workspace pin-instance
n8nac workspace clear-instance
n8nac workspace set-project
n8nac workspace clear-project
n8nac workspace set-sync-folder
n8nac workspace clear-sync-folder
```

Recommended product direction:

- `workspace status` can remain but should show environment-aware status;
- new setup flows should use `env` commands;
- docs and agent guidance should move to `env`.

This spec does not require preserving direct instance targeting behavior.

---

## 9. ConfigService Technical Changes

### 9.1 New Methods

In `packages/cli/src/services/config-service.ts`, add:

```ts
getPersistedWorkspaceConfig(): IPersistedWorkspaceConfigV3 | IPersistedWorkspaceConfigV4;
getEnvironmentConfig(): IWorkspaceConfigV4;
listEnvironments(): IN8nWorkspaceEnvironment[];
getActiveEnvironmentId(): string | undefined;
resolveEnvironment(environmentNameOrId?: string): IResolvedWorkspaceEnvironment;
prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment>;
addEnvironment(input: AddEnvironmentInput): IN8nWorkspaceEnvironment;
updateEnvironment(nameOrId: string, patch: UpdateEnvironmentInput): IN8nWorkspaceEnvironment;
pinEnvironment(nameOrId: string): IN8nWorkspaceEnvironment;
removeEnvironment(nameOrId: string): IN8nWorkspaceEnvironment;
```

### 9.2 Methods To Refactor

Current methods should become environment-aware:

```ts
getLocalConfig(environmentNameOrId?: string)
getWorkspaceConfig()
getEffectiveInstanceConfig(instanceId?)
getEffectiveContext(instanceId?)
prepareWorkspaceContext(instanceId?)
getActiveInstanceId()
```

Recommended approach:

- keep method names temporarily if heavily used internally;
- internally route them through `resolveEnvironment()` where appropriate;
- introduce new clearer methods for new code.

Example:

```ts
getLocalConfig(environmentNameOrId?: string): Partial<ILocalConfig> {
    try {
        return this.environmentToLocalConfig(this.resolveEnvironment(environmentNameOrId));
    } catch {
        return {};
    }
}
```

### 9.3 Writing Workspace Config

Add private methods:

```ts
private readN8nacWorkspaceConfig(): IPersistedWorkspaceConfigV3 | IPersistedWorkspaceConfigV4;
private writeN8nacWorkspaceConfig(config: IPersistedWorkspaceConfigV4): void;
private getWorkspaceConfigPath(): string;
private normalizeEnvironmentInput(input: AddEnvironmentInput): IN8nWorkspaceEnvironment;
private resolveEnvironmentInstanceTarget(environment: IN8nWorkspaceEnvironment): ResolvedInstanceTarget;
private resolveEnvironmentApiKey(target: ResolvedInstanceTarget, environment: IN8nWorkspaceEnvironment): ResolvedApiKey;
private slugEnvironmentId(name: string): string;
private assertUniqueEnvironment(id: string, name: string, existing?: string): void;
```

Current `getInstanceConfigPath()` delegates to n8n-manager-core:

```ts
return this.manager.getWorkspaceConfigPath(this.workspaceRoot);
```

This can still be used for path resolution, but not for v4 serialization if manager-core strips unknown fields.

### 9.4 v3 Compatibility As Migration Input

Even if `--instance` is not retained, existing workspace configs may exist. If no v4 workspace config exists, v3 config should be interpreted as one read-only implicit environment until the user writes v4.

Implicit environment shape:

```ts
{
    instanceTargets: [{
        id: 'default-instance',
        name: 'Default Instance',
        kind: 'global-ref',
        instanceRef: v3.activeInstanceId ?? global.activeInstanceId,
    }],
    activeEnvironmentId: 'default',
    environments: [{
    id: 'default',
    name: 'Default',
    instanceTargetId: 'default-instance',
    projectId: v3.projectId,
    projectName: v3.projectName,
    syncFolder: v3.syncFolder ?? 'workflows',
    folderSync: v3.folderSync,
    customNodesPath: v3.customNodesPath,
    }]
}
```

When the user runs `n8nac env add`, `env update`, or `env pin`, write v4.

Do not automatically rewrite user files on read.

MVP v3 fallback rules:

- the implicit environment exists only when the persisted workspace config is v3 or absent; it must not coexist with persisted v4 environments;
- sync-capable commands may use the implicit environment only if it resolves an instance ID from `v3.activeInstanceId` or the global active instance, project settings from v3 or the global instance default, and a sync folder from v3 or the default `workflows`;
- if these fields cannot be resolved, sync-capable commands fail with migration/setup guidance;
- when config version is 4, v3 singleton fields are ignored and must not be used as fallback.

### 9.5 Environment Preparation And Runtime

Current `prepareWorkspaceContext(instanceId?)` calls:

```ts
this.runtime.prepareEffectiveContext({
    workspaceRoot: this.workspaceRoot,
    instanceId,
    syncFolderDefault: 'workspace',
    consumer: 'cli',
    autoStart: true,
});
```

New logic:

1. resolve environment to a target kind;
2. for `instanceRef`, call runtime prepare with the referenced global instance ID to auto-start/prepare managed instances;
3. for embedded `instance`, skip runtime preparation and build the API context from `baseUrl` plus locally resolved credentials;
4. ignore workspace singleton project/sync fields from manager-core for v4;
5. overlay environment project/sync fields in n8nac.

Pseudo-code:

```ts
async prepareEnvironment(environmentNameOrId?: string): Promise<IResolvedWorkspaceEnvironment> {
    const resolved = this.resolveEnvironment(environmentNameOrId);
    if (resolved.targetKind === 'embedded') {
        return this.prepareEmbeddedEnvironment(resolved);
    }

    const prepared = await this.runtime.prepareEffectiveContext({
        workspaceRoot: this.workspaceRoot,
        instanceId: resolved.globalInstanceId,
        syncFolderDefault: 'workspace',
        consumer: 'cli',
        autoStart: true,
    });

    if (prepared.runtime.blocked) {
        throw new Error(prepared.runtime.blocked.message);
    }

    return this.mergePreparedRuntimeWithEnvironment(prepared.context, resolved.environment);
}
```

---

## 10. BaseCommand Technical Changes

### 10.1 Current Problem

`BaseCommand` currently knows about `activeInstanceId` and `N8NAC_INSTANCE_NAME`.

This should become selected environment context.

### 10.2 New Fields

```ts
protected activeEnvironmentId?: string;
protected activeEnvironmentName?: string;
protected activeInstanceId?: string;
protected activeTargetKind?: 'global-ref' | 'embedded';
protected instanceIdentifier: string | null = null;
```

### 10.3 Constructor Behavior

Current constructor performs a lot of resolution immediately. With environments, prefer this flow:

1. create `ConfigService`;
2. read explicit environment from `process.env.N8NAC_ENVIRONMENT` or constructor options;
3. resolve lightweight environment if possible;
4. initialize `N8nApiClient` with host/apiKey if immediately available;
5. defer full runtime prep to `prepareRuntimeContext()`.

### 10.4 `prepareRuntimeContext()`

Current:

```ts
const context = await this.configService.prepareWorkspaceContext(this.activeInstanceId);
```

New:

```ts
const context = await this.configService.prepareEnvironment(this.activeEnvironmentIdOrName);
```

Then set:

```ts
this.activeEnvironmentId = context.environmentId;
this.activeEnvironmentName = context.environmentName;
this.activeInstanceId = context.activeInstanceId;
this.activeTargetKind = context.targetKind;
this.client = new N8nApiClient({ host: context.host, apiKey: context.apiKey });
this.config = {
    ...this.config,
    directory: this.configService.resolveWorkspacePath(context.syncFolder || './workflows'),
    host: context.host,
    apiKeyConfigured: true,
    folderSync: context.folderSync ?? false,
};
```

### 10.5 `getSyncConfig()`

Current sync config includes:

```ts
{
    directory: this.config.directory,
    workflowDir: localConfig.workflowDir ? ... : undefined,
    instanceIdentifier,
    instanceConfigPath,
    projectId,
    projectName,
    folderSync,
}
```

New sync config should include environment metadata too:

```ts
{
    directory: context.syncFolder,
    workflowDir: context.workflowDir,
    instanceIdentifier: context.instanceIdentifier,
    instanceConfigPath: this.configService.getInstanceConfigPath(),
    projectId: context.projectId,
    projectName: context.projectName,
    folderSync: context.folderSync ?? false,
    environmentId: context.environmentId,
    environmentName: context.environmentName,
    targetKind: context.targetKind,
    apiKeySource: context.apiKeySource,
}
```

Update `ISyncConfig` in `packages/cli/src/core/types.ts` accordingly.

---

## 11. Sync Engine Implications

### 11.1 Existing Design Mostly Works

Because `SyncManager` stores all state under `instanceDir`, environment isolation works if `workflowDir` differs per environment.

No major changes required in:

- `StateManager`;
- `SyncEventJournal`;
- `WorkflowStateTracker`;
- `SyncEngine`.

### 11.2 Required Sync Config Metadata

Add environment metadata for logging/debugging/UI:

```ts
interface ISyncConfig {
    directory: string;
    workflowDir?: string;
    instanceIdentifier?: string;
    instanceConfigPath?: string;
    projectId?: string;
    projectName?: string;
    folderSync?: boolean;
    environmentId?: string;
    environmentName?: string;
    targetKind?: 'global-ref' | 'embedded';
    apiKeySource?: 'env' | 'workspace-local' | 'global' | 'missing';
}
```

### 11.3 State Isolation Invariant

The following files must be environment-specific because they live in `workflowDir`:

```text
.n8n-state.json
.n8n-sync-events.jsonl
.workflow.ts files
.trash/
tsconfig.json
n8n-workflows.d.ts
```

Test this explicitly.

---

## 12. Promotion Command Technical Design

### 12.1 New Command Module

Add:

```text
packages/cli/src/commands/promote.ts
```

Class:

```ts
export class PromoteCommand {
    constructor(private readonly configService = new ConfigService()) {}

    async run(sourcePath: string, options: PromoteOptions): Promise<void>;
}
```

Options:

```ts
interface PromoteOptions {
    from: string;
    to: string;
    dryRun?: boolean;
    noPush?: boolean;
    overwrite?: boolean;
    json?: boolean;
}
```

### 12.2 MVP Input Contract

For MVP, require a source path.

```bash
n8nac promote workflows/dev/my.workflow.ts --from Dev --to Prod
```

Do not initially support workflow ID or fuzzy name. That can be added later after logical identity is solved.

### 12.3 Promotion Algorithm

1. Resolve source environment.
2. Resolve target environment.
3. Ensure source and target environment IDs differ.
4. Resolve source workflow path.
5. Assert source path is inside source `workflowDir`.
6. Read/parse source workflow using existing transformer/compiler utilities where possible.
7. Compute target relative path from source path relative to source `workflowDir`.
8. Resolve target file path under target `workflowDir`.
9. If target file exists, read target workflow metadata and preserve target workflow ID.
10. If target file exists and this is not `--dry-run`, require `--overwrite` before replacing the local target file.
11. If target file does not exist, strip source remote workflow ID so push creates a new remote workflow.
12. Rewrite project metadata to target environment’s `projectId/projectName`.
13. Write target file unless `--dry-run`.
14. If `--no-push`, stop after file creation and report next command.
15. Otherwise run push using target environment context.
16. Report source env, target env, target file, and target remote workflow ID.

### 12.4 ID Handling

Current workflow files can contain n8n remote IDs in workflow metadata.

Promotion must not blindly carry Dev workflow ID to Prod.

Rules:

- If target file exists and has an ID, preserve target ID.
- If target file does not exist, remove ID before first target push.
- If target file exists, replacing it requires `--overwrite`; `--dry-run` may still report the derived target path without replacing it.
- If target file exists but remote target workflow is missing, existing sync logic can recreate or fail depending on current `push` semantics.

### 12.5 Target Matching MVP

MVP matching uses relative path only.

Example:

```text
Source workflowDir: workflows/dev/n8n_dev/personal
Source path:        workflows/dev/n8n_dev/personal/invoice.workflow.ts
Relative path:      invoice.workflow.ts
Target workflowDir: workflows/prod/n8n_prod/cgi
Target path:        workflows/prod/n8n_prod/cgi/invoice.workflow.ts
```

This is predictable and avoids introducing logical deployment keys too early.

### 12.6 Future Logical Identity

Future enhancement:

```ts
@workflow({
    name: 'Invoice Reminder',
    deploymentKey: 'invoice-reminder'
})
```

Deployment state could map:

```json
{
  "invoice-reminder": {
    "dev": "dev-workflow-id",
    "prod": "prod-workflow-id"
  }
}
```

Do not include this in MVP.

### 12.7 Credential Handling

Promotion should warn, not solve credentials automatically.

After writing/pushing target workflow, suggest:

```bash
n8nac --env Prod workflow credential-required <workflow-id>
```

Optional future:

```bash
n8nac promote ... --check-credentials
n8nac promote ... --ensure-credentials
```

---

## 13. VS Code Extension Impact

Relevant files:

- `packages/vscode-extension/src/services/n8n-configuration-controller.ts`
- `packages/vscode-extension/src/ui/configuration-webview.ts`
- `packages/vscode-extension/src/ui/configuration-webview-html.ts`
- `packages/vscode-extension/src/utils/unified-config.ts`
- `packages/vscode-extension/src/extension.ts`

Current VS Code configuration UI has concepts like:

- global active instance;
- workspace active instance override;
- project settings;
- sync folder settings.

The target UI should keep the useful “instance creation and instance list” experience, but change the workspace side from singleton project/sync settings to explicit environment management.

Recommended layout:

```text
+---------------------------------------+---------------------------------------+
| Instances                             | Workspace Environments                |
| Machine/global n8n-manager registry   | Repo-local n8nac environment mapping  |
+---------------------------------------+---------------------------------------+
| + Create managed local instance       | + Add instance target                 |
| + Connect existing instance globally  | + Add environment                     |
|                                       | + Attach target + project + folder    |
| Global instances list:                |                                       |
| - managedA                            | Instance targets:                     |
| - localSandbox                        | - Dev target -> ref(managedA)         |
| - personalCloud                       | - Prod target -> https://prod...      |
|                                       | Environments:                         |
|                                       | * Dev  = Dev target + Personal        |
|                                       |   Prod = Prod target + CGI            |
| Actions:                              |                                       |
| - start/stop/restart managed          | Actions:                              |
| - test auth                           | - pin default                         |
| - select global default               | - edit project/sync folder            |
| - delete global instance              | - check access                        |
|                                       | - remove environment                  |
+---------------------------------------+---------------------------------------+
```

### 13.1 Left Panel: Global/Machine Instances

The left side remains the n8n-manager view.

It should show:

- global active instance;
- all machine-known instances;
- mode: `managed-local-docker`, `existing`, `generation-only`, etc.;
- base URL or current public/tunnel URL;
- managed runtime status;
- whether an API key exists locally;
- default project if selected globally;
- start/stop/restart controls for managed instances;
- auth/test actions;
- create/connect/delete actions.

The left panel is not the workspace targeting model. It is the machine registry and runtime manager.

### 13.2 Right Panel: Workspace Environments

The right side becomes the n8nac workspace environment manager.

It should show:

- active workspace environment;
- all environments defined in `n8nac-config.json`;
- target kind: `global-ref` or `embedded`;
- referenced global instance name when target kind is `global-ref`;
- embedded base URL when target kind is `embedded`;
- project ID/name;
- sync folder;
- computed workflow directory;
- credential/access status for the current user;
- warnings if the config is tracked but no local API key is available;
- warnings if an environment references a missing global instance.

Right-side actions:

- **Add instance target from selected global instance**: creates a workspace target with `kind: 'global-ref'`.
- **Add embedded public instance target**: creates a workspace target with `kind: 'embedded'`, `instance.mode = existing`, and `baseUrl`.
- **Add environment**: attaches one instance target, one project, and one sync folder.
- **Pin default environment**: writes `activeEnvironmentId`.
- **Edit project**: updates `projectId/projectName`.
- **Edit sync folder**: updates `syncFolder`.
- **Check access**: validates API key, project access, workflow permissions where possible.
- **Promote workflow**: later action exposed from a workflow item or command palette.
- **Remove environment**: removes the mapping but does not delete a global instance or remote n8n instance.

The UI must make the difference explicit:

```text
Deleting an environment removes this workspace mapping only.
Deleting a global instance removes it from this machine's n8n-manager registry.
Neither action deletes workflows from n8n unless a separate destructive workflow command is run.
```

### 13.3 Instance Target And Environment Creation UI

Creation should happen in two conceptual steps.

Step A: create or select an instance target.

From selected global instance:

```text
Instance target name: Local Managed A
Target: managedA (global instance reference)
```

Writes:

```json
{
  "id": "managedA",
  "name": "Local Managed A",
  "kind": "global-ref",
  "instanceRef": "managedA",
}
```

Embedded public instance target:

```text
Instance target name: Production n8n
URL: https://prod-n8n.example.com
```

Writes:

```json
{
  "id": "prod-n8n",
  "name": "Production n8n",
  "kind": "embedded",
  "instance": {
    "mode": "existing",
    "baseUrl": "https://prod-n8n.example.com"
  }
}
```

Step B: create an environment by attaching the instance target to a project and sync folder.

```text
Environment name: Production
Instance target: Production n8n
Project: CGI
Sync folder: workflows/prod
```

Writes:

```json
{
  "id": "production",
  "name": "Production",
  "instanceTargetId": "prod-n8n",
  "projectId": "cgi",
  "projectName": "CGI",
  "syncFolder": "workflows/prod"
}
```

The UI must not write API keys into either the tracked instance target or the tracked environment config.

### 13.4 Access And Credential UI

Each environment should have an access status badge:

```text
Ready
Missing API key
Invalid API key
Project inaccessible
Insufficient permissions
Referenced global instance missing
Runtime unavailable
Unknown
```

For embedded environments, if the URL is configured but no API key is found, show:

```text
Environment is tracked, but no local API key is configured for your user.
Provide one through your preferred secret mechanism or n8n-manager global secrets.
```

If the team chooses to support workspace-local ignored secrets later, the UI may offer:

```text
Store API key locally for this workspace
```

But this must write only to ignored local files and must clearly show the target path.

### 13.5 Snapshot Shape

`N8nConfigurationSnapshot` should include:

```ts
workspace: {
    version: 4;
    activeEnvironmentId?: string;
    instanceTargets: Array<{
        id: string;
        name: string;
        kind: 'global-ref' | 'embedded';
        instanceRef?: string;
        instance?: {
            mode: 'existing';
            baseUrl: string;
        };
        apiKeyAvailable: boolean;
        credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
        accessStatus: EnvironmentAccessStatus;
    }>;
    environments: Array<{
        id: string;
        name: string;
        instanceTargetId: string;
        instanceTargetName: string;
        targetKind: 'global-ref' | 'embedded';
        globalInstanceId?: string;
        instanceName?: string;
        baseUrl?: string;
        projectId?: string;
        projectName?: string;
        syncFolder: string;
        workflowDir?: string;
        apiKeyAvailable: boolean;
        credentialSource?: 'env' | 'workspace-local' | 'global' | 'missing';
        accessStatus: EnvironmentAccessStatus;
    }>;
}
```

### 13.6 Extension Command Targeting

Any extension command that currently uses effective context should use active environment by default.

Commands that need a non-default environment should show an environment QuickPick, not an instance QuickPick.

Examples:

```text
Deploy/Promote workflow...
Run list in environment...
Open workflow in environment...
Check credentials in environment...
```

The extension must pass the selected environment ID/name to the same environment-aware `ConfigService`/CLI API path used by the CLI.

---

## 14. Agent And Skills Impact

Relevant files:

- `skills/n8n-architect/SKILL.md`
- `packages/skills/src/agent-skills/n8n-architect/SKILL.md`
- `packages/skills/src/services/ai-context-generator.ts`
- plugin copies under `plugins/*/n8n-as-code/skills/*`

Agent instructions should change from workspace instance pinning to environment usage.

Replace guidance like:

```bash
npx --yes n8nac workspace pin-instance --instance-id <id>
```

with:

```bash
npx --yes n8nac instance-target add DevTarget --instance-ref <global-instance-id>
npx --yes n8nac instance-target add ProdTarget --base-url <public-url>
npx --yes n8nac env add Dev --instance-target DevTarget --project-id <project-id> --project-name <project-name> --sync-folder workflows/dev
npx --yes n8nac env add Prod --instance-target ProdTarget --project-id <project-id> --project-name <project-name> --sync-folder workflows/prod
npx --yes n8nac env pin Dev
```

Agent behavior:

- use pinned environment by default;
- when user asks “deploy to Production”, use `n8nac promote ... --to Prod`;
- when user asks “check Prod”, use `n8nac --env Prod ...`;
- never manually copy files between environment folders if `promote` exists;
- never assume credentials are portable.
- never assume an embedded public environment means the current user has access rights;
- when access fails, ask the user to provide/check their own API key or project permissions rather than editing tracked config.

---

## 15. Documentation Impact

Relevant docs:

- `README.md`
- `packages/cli/README.md`
- `docs/docs/getting-started/index.md`
- `docs/docs/contribution/architecture.md`
- `docs/docs/contribution/sync.md`

Later user docs should explain:

- what an environment is;
- how it differs from an instance;
- how to add/pin/list environments;
- how sync paths are structured;
- how promotion works;
- what promotion does not do.

Suggested docs wording:

```text
An environment is a workspace-level target created by attaching an existing n8n instance target, one n8n project, and one local sync folder. The instance target can reference a machine-owned global n8n-manager instance or embed a public non-secret URL for a shared team instance. You can set a default environment for normal work, and explicitly promote workflows between environments when needed.
```

---

## 16. Migration Strategy

### 16.1 Existing v3 Workspace Configs

Do not destructively rewrite on read.

If v3 exists:

```json
{
  "version": 3,
  "activeInstanceId": "test",
  "syncFolder": "workflows-test",
  "projectId": "project-test",
  "projectName": "Test Project"
}
```

`ConfigService` can expose it as implicit environment:

```json
{
  "instanceTargets": [
    {
      "id": "default-instance",
      "name": "Default Instance",
      "kind": "global-ref",
      "instanceRef": "test"
    }
  ],
  "activeEnvironmentId": "default",
  "environments": [
    {
      "id": "default",
      "name": "Default",
      "instanceTargetId": "default-instance",
      "syncFolder": "workflows-test",
      "projectId": "project-test",
      "projectName": "Test Project"
    }
  ]
}
```

When user runs an env write command, persist v4.

### 16.2 Legacy Commands

Product/docs should move to `env`.

This spec intentionally does not preserve direct `--instance` targeting as a user-facing compatibility path.

### 16.3 Generated AI Context

`update-ai` should regenerate instructions that use environments.

If a workspace has v3 config, generated instructions can say:

```text
This workspace uses a legacy default environment. Run `n8nac env status` to inspect it, or `n8nac env add ...` to create named environments.
```

---

## 17. Testing Plan

### 17.1 Unit Tests: ConfigService

Update/add tests in:

- `packages/cli/tests/unit/config-service.test.ts`

Cases:

1. creates v4 instance target config with `instance-target add`;
2. pins environment and resolves it by default;
3. explicit environment overrides pinned environment;
4. resolves by environment ID;
5. resolves by case-insensitive environment name;
6. errors on unknown environment;
7. errors on duplicate environment name if allowed by malformed config;
8. project settings do not leak across environments;
9. sync folder settings do not leak across environments;
10. v3 workspace config is exposed as implicit default environment;
11. v3 is only rewritten to v4 on write command;
12. missing project gives environment-aware error;
13. missing sync folder gives environment-aware error;
14. environment with instance default project resolves project from global instance;
15. global-ref instance target resolves through global n8n-manager instance store;
16. embedded instance target resolves from tracked `baseUrl` without requiring global instance ID;
17. managed/local instance details are never copied into v4 environment config;
18. instance target validation rejects both `instanceRef` and `instance` on the same entry;
19. instance target validation rejects embedded managed-local descriptors;
20. API key source resolution reports MVP sources `env`, `global`, or `missing`; `workspace-local` is reserved for later secret-file support.

### 17.2 Integration Tests: CLI Environment Commands

Add test file:

```text
packages/cli/tests/integration/environment-cli.integration.test.ts
```

Cases:

1. `n8nac instance-target add ProdTarget --base-url ... --json` writes v4 instance target config;
2. `n8nac env list --json` includes resolved instance info;
3. `n8nac env pin Dev` sets active environment;
4. `n8nac env status --json` shows effective context;
5. `n8nac --env Prod workspace status --json` or equivalent shows Prod context;
6. global option parsing works with `help --env Dev skills`;
7. removed direct instance targeting is not in `n8nac --help`;
8. `instance-target add DevTarget --instance-ref managedA` writes a reference target;
9. `instance-target add ProdTarget --base-url https://prod...` writes an embedded public descriptor;
10. `env add Prod --instance-target ProdTarget --project-id ... --sync-folder ...` writes an environment attachment;
11. `instance-target add Bad --instance-ref a --base-url b` fails;
12. embedded environment can list/status with API key from env var;
13. embedded environment with no API key returns missing credential diagnostics, not a config parse error.

### 17.3 Sync Isolation Tests

Use existing sync tests as model:

- `packages/cli/tests/integration/list-archived.integration.test.ts`
- `packages/cli/tests/scenarios/sync-scenarios.test.ts`

Cases:

1. Dev and Prod environments produce different `workflowDir` values;
2. `.n8n-state.json` is written under selected environment only;
3. `.n8n-sync-events.jsonl` is written under selected environment only;
4. `list --env Dev` uses Dev project ID;
5. `list --env Prod` uses Prod project ID.

### 17.4 Promotion Tests

Add:

```text
packages/cli/tests/unit/promote-command.test.ts
packages/cli/tests/integration/promote-cli.integration.test.ts
```

Cases:

1. promotion copies source file to target relative path;
2. promotion rewrites project metadata to target project;
3. promotion strips source workflow ID when target file does not exist;
4. promotion preserves target workflow ID when target file exists;
5. promotion refuses same source/target env;
6. promotion refuses source path outside source workflowDir;
7. `--dry-run` does not write or push;
8. `--no-push` writes target file but does not call API;
9. failed target push leaves clear diagnostics.

### 17.5 VS Code Tests

Update/add unit tests around:

- `packages/vscode-extension/tests/unit/unified-config.test.ts`

Cases:

1. reads v4 environment config;
2. active environment controls effective display;
3. saving workspace environment writes correct config shape;
4. deleting active env requires explicit fallback or clears active environment.
5. left panel global instance list remains available;
6. right panel environment list shows `global-ref` and `embedded` targets distinctly;
7. access status shows missing API key for embedded environment without local credentials;
8. instance target creation from selected global instance writes `kind: 'global-ref'` and `instanceRef`;
9. instance target creation from public URL writes embedded `instance` descriptor;
10. environment creation attaches existing target + project + sync folder;
11. removing environment does not delete global instance or workspace instance target unless explicitly requested.

---

## 18. Implementation Phases

### Phase 1: Architecture Doc

Create target architecture document:

```text
architecture/target/workspace-environments-and-promotion.md
```

### Phase 2: Config Model

Implement v4 workspace config parsing/writing in `ConfigService`.

Add instance target types, environment attachment types, credential-source reporting, validation methods, and tests.

### Phase 3: CLI Environment Commands

Add `instance-target`, `env`, and `environment` commands.

Add global `--env` option.

Route `BaseCommand` through environment resolution.

Add instance target creation paths for `--instance-ref` and `--base-url`, then environment creation through `--instance-target`.

### Phase 4: Sync Integration

Make `getSyncConfig()` environment-aware.

Add environment metadata to `ISyncConfig`.

Verify list/pull/push/fetch/resolve/test/workflow/execution/credential commands use selected environment.

### Phase 5: Promotion MVP

Add `n8nac promote <path> --from <env> --to <env>`.

Implement safe file adaptation and target push.

### Phase 6: VS Code And Agent Guidance

Update VS Code configuration snapshot and UI with a two-panel model: global/machine instances on the left, workspace environment management on the right.

Update skills and generated agent context.

### Phase 7: Documentation

Update README, CLI README, getting started, and contribution architecture docs.

---

## 19. Open Technical Questions

1. Should v4 workspace config be fully owned by n8nac, or should n8n-manager-core learn v4 environment schema?

Recommended answer: n8nac owns it initially.

2. Should environment `syncFolder` point to the root environment folder or the final workflow directory?

Recommended answer: root environment folder. Final `workflowDir` remains computed as `syncFolder/instanceIdentifier/projectSlug`.

3. Should `env add` require project fields?

Recommended answer: yes for sync-ready environments, but allow `--use-instance-default-project` or fallback if instance has a default project.

4. Should `promote` push by default?

Recommended answer: yes. Promotion means deployment. Provide `--no-push` and `--dry-run` for safety.

5. Should promotion use file path or workflow ID first?

Recommended answer: file path first. It is deterministic and avoids remote ambiguity.

6. Should environment names be unique?

Recommended answer: yes. Enforce unique ID and case-insensitive unique name.

7. Should embedded descriptors support managed/local instances?

Recommended answer: no. Managed/local instances are machine-owned and should be global references only.

8. Should n8nac provide first-class workspace-local secret storage?

Recommended answer: not in the first implementation. Define lookup hooks and diagnostics, but keep secrets user-owned unless a later product decision adds local secret management.

9. Should embedded descriptors be automatically imported into global n8n-manager config?

Recommended answer: no by default. The workspace instance target can be used directly. A later explicit command may offer “save this workspace endpoint globally” as a convenience.

---

## 20. Risks

### 20.1 Config Ownership Split

Direct v4 parsing in n8nac while n8n-manager-core still reads v3 can create two interpretations of `n8nac-config.json`.

Mitigation:

- centralize all v4 environment reads/writes in `ConfigService`;
- do not call `manager.writeWorkspaceOverrides()` for v4 environment updates;
- update adapter/extension to consume `ConfigService` or equivalent environment-aware facade.

### 20.1.1 Target Ownership Confusion

Users may confuse global instances and workspace environments, especially when the VS Code UI shows both.

Mitigation:

- label the left panel “Machine instances” or “Global n8n-manager instances”;
- label the right panel “Workspace environments”;
- make delete actions explicit about what they remove;
- show `global-ref` vs `embedded` target kind in environment details.

### 20.2 Promotion Duplicates

If target file does not exist, promotion creates a new remote workflow. Re-running may duplicate if target file or state is lost.

Mitigation:

- use target relative path as MVP identity;
- after first push, target file contains target workflow ID;
- future logical deployment keys can improve this.

### 20.3 Credential Mismatch

A workflow promoted to Prod may reference credentials that do not exist in Prod.

Mitigation:

- warn after promotion;
- provide `credential-required` checks in target env;
- do not auto-map credentials in MVP.

### 20.3.1 Access Rights Mismatch

Two engineers may clone the same workspace config but have different permissions on the same public n8n instance.

Mitigation:

- access status per environment must be per-user/per-machine;
- do not write permission-derived state into tracked config;
- surface project membership and workflow permission failures clearly;
- avoid “fixing” access failures by modifying environment config.

### 20.4 Breaking Existing User Habits

Moving from instance targeting to environment targeting changes user vocabulary.

Mitigation:

- make env commands easy;
- provide clear errors;
- generate better agent guidance;
- make migration from v3 simple.

---

## 21. Acceptance Criteria

Product acceptance:

- users can define multiple environments per workspace;
- users can define workspace instance targets from global instance references or embedded public instance descriptors;
- users can define environments by attaching one instance target, one project, and one sync folder;
- users can pin a default environment;
- users can target an environment explicitly with `--env`;
- users can promote a workflow from one environment to another;
- VS Code exposes global instances and workspace environments as distinct concepts;
- docs and agent guidance explain environments, not direct instance targeting.

Technical acceptance:

- v4 workspace config stores instance target list, environment list, and active environment;
- v4 workspace config supports exactly one target kind per instance target: `instanceRef` or embedded `instance`;
- v4 workspace environments reference targets through `instanceTargetId`;
- embedded descriptors never contain secrets or managed runtime details;
- ConfigService resolves explicit/pinned environments correctly;
- ConfigService resolves instance targets, global references, and embedded descriptors correctly;
- credential source resolution reports env/global/missing in MVP, with workspace-local reserved for later secret-file support;
- project/sync settings do not leak between environments;
- sync state remains physically isolated per environment;
- access diagnostics distinguish missing credentials from runtime/config unknown states offline, and surface inaccessible project or insufficient permission failures when commands or explicit online status checks encounter them;
- promotion preserves target IDs and strips source IDs as needed;
- tests cover config, CLI, sync isolation, and promotion.

---

## 22. Final Product Wording

High-level product description:

```text
In n8n-as-code, an environment is a workspace-level target created by attaching an existing n8n instance target, one n8n project, and one local sync folder. The instance target can reference a machine-owned global n8n-manager instance or embed a shared public n8n URL. Users can create as many environments as needed, choose a default one for normal work, and explicitly promote workflows between environments when they want to move work from Dev to Staging or Production.
```

Short version:

```text
n8n-manager owns machine instances and runtime management. n8nac owns workspace environments and portable public target descriptors. Git owns review and versioning. promote owns explicit workflow movement between environments. Secrets and access rights stay local to each user.
```
