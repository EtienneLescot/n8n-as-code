# Git-like Sync Architecture Handover (CLI + VSCode)

Date: 2026-02-26  
Branch context: `feat/git-like-sync-architecture`

## 1) Context and problem statement

The project has moved away from the previous auto-sync / polling paradigm toward a git-like, explicit user-driven model.

Key implications:
- No background guarantee that local and remote states are always known.
- Conflict/change detection is expected at explicit command boundaries (`pull`, `push`, optional `fetch`).
- Full “global status with deep compare of everything” is now conceptually expensive and less aligned with the intended UX.

## 2) Decisions made

### 2.1 Status model

- `In Sync` as a first-class global concept is deprecated.
- We should avoid implying continuous synchronization.
- Status should be interpreted as a point-in-time, command-scoped observation.

### 2.2 Command paradigm

Move to per-workflow and lightweight listing:

- Keep one listing command with modes:
  - `n8nac list` → combined local + remote overview matched by workflow ID.
  - `n8nac list --local` → local workflows only.
  - `n8nac list --remote` (alias `--distant`) → remote workflows only.
- Listing must be ultra-lightweight:
  - no TypeScript workflow transformation/compilation,
  - no full payload deep diff during list.

### 2.3 Fetch command

- Keep `fetch` as an explicit, useful operation.
- Recommended semantics:
  - `fetch <workflowId>` updates local remote-reference/status cache for one workflow.
  - optional `fetch --all` for explicit bulk remote refresh.
- `pullone`/`pushone` remain sufficient for correctness and final conflict checks.

### 2.4 Local-only visibility

- Current behavior does not properly surface local-only workflows.
- New list model must always expose local-only entries in combined or local mode.

### 2.5 VSCode extension UX changes

- Extension must rely on new list commands for tree population/status.
- Global refresh action should trigger the list refresh path.
- Add per-workflow **Fetch** button/action.
- Remove per-workflow trash/delete action (deletion split as separate concern: local file delete vs remote workflow delete).

## 3) Target CLI behavior (detailed)

## 3.1 `list`

`n8nac list`
- Inputs:
  - local files metadata (ID, filename, maybe modified time),
  - remote workflows metadata (ID, name, updatedAt, active, etc.).
- Processing:
  - match by workflow ID,
  - classify into `local-only`, `remote-only`, `both`.
- Output:
  - compact table suitable for humans,
  - optional machine-readable mode (`--json`) if already supported.

`n8nac list --local`
- Only local files/workflow metadata.

`n8nac list --remote` / `n8nac list --distant`
- Only remote metadata from API listing endpoint.

Performance constraints:
- O(Nlocal + Nremote) matching.
- Paginated remote listing only; avoid full content downloads unless requested by `fetch`/`pull`.

## 3.2 `fetch`

`n8nac fetch <id>`
- Retrieve latest remote metadata (and optionally content snapshot for that workflow only).
- Update internal per-workflow reference/status storage used for comparison diagnostics.
- No broad scan.

`n8nac fetch --all` (optional)
- Explicit full remote reference refresh.
- Still decoupled from automatic sync.

## 3.3 `pullone` and `pushone`

- Keep as core safe operations.
- They perform authoritative checks and conflict detection at execution time.
- Any expensive transform/deep compare belongs here, not in `list`.

## 4) VSCode extension behavior (detailed)

Tree data source:
- Use `list` output as primary data source.
- Show local-only workflows explicitly.

Actions:
- Per workflow:
  - `Pull`
  - `Push`
  - `Fetch` (new)
- Global:
  - `Refresh` => rerun list and refresh tree.
- Remove trash icon/action from workflow row.

Deletion policy:
- Separate commands/flows for:
  - deleting local file,
  - deleting remote workflow.
- No ambiguous single trash action in combined workflow row.

## 5) Migration / deprecation plan

1. Soft deprecate `sync status`:
   - keep command temporarily with warning pointing to `list`.
2. Update docs and extension labels to stop using old “sync status / in sync” vocabulary.
3. After one release cycle, remove or alias old command depending on compatibility goals.

Suggested warning text:
> `sync status` is deprecated in git-like mode. Use `n8nac list`, `n8nac list --local`, or `n8nac list --remote`.

## 6) Implementation checklist

CLI:
- [ ] Add/confirm `list` mode flags (`--local`, `--remote`, alias `--distant`).
- [ ] Ensure default `list` merges local + remote by ID and includes local-only.
- [ ] Ensure no TS transform in list path.
- [ ] Keep/adjust `fetch <id>` semantics and help text.
- [ ] Add/update tests for listing modes and local-only coverage.
- [ ] Add deprecation warning path for `sync status`.

VSCode extension:
- [ ] Update workflow store/provider to consume new list semantics.
- [ ] Display local-only workflows properly.
- [ ] Add per-item Fetch command/button.
- [ ] Map global refresh to list command refresh.
- [ ] Remove per-item trash/delete action.
- [ ] Update extension tests/snapshots if present.

Docs:
- [ ] Root `README.md` command table updates.
- [ ] `packages/cli/README.md` command behavior updates.
- [ ] `packages/vscode-extension/README.md` UI/action updates.
- [ ] Any migration notes (`MANUAL_TESTING.md`, architecture docs) to remove old sync phrasing.

## 7) Testing and validation strategy

Functional:
- Small workspace: verify `list`, `list --local`, `list --remote` correctness.
- Local-only case: create local workflow absent remotely, verify visibility.
- Remote-only case: verify presence in default and remote mode.
- Per-workflow fetch: run `fetch <id>`, then `pullone`/`pushone` behavior remains consistent.

Scalability:
- Validate on large instance (hundreds of workflows):
  - listing remains responsive,
  - no full payload retrieval in list path,
  - bounded API pagination and stable memory.

Extension UX:
- Tree shows local-only entries.
- Fetch button works per item.
- Global refresh triggers list.
- No trash icon in workflow rows.

## 8) Risks and mitigations

Risk: Users rely on old `sync status` semantics.  
Mitigation: deprecation warning + migration examples in docs.

Risk: Ambiguity around “status freshness” without auto polling.  
Mitigation: clear wording: status is snapshot-at-command-time; encourage explicit `fetch`/`pull`/`push` flows.

Risk: Performance regressions on large instances.  
Mitigation: enforce lightweight metadata-only list path and tests guarding against full content fetches.

## 9) Open questions (to confirm)

1. Should `--remote` be the canonical flag and `--distant` alias, or vice versa?
2. Should `fetch --all` be part of initial delivery or a follow-up?
3. Do we keep `sync status` as alias for one release or remove immediately?
4. What exact fields should default `list` show in human table output?

## 10) Acceptance criteria

- `list` commands are lightweight and scalable.
- Local-only workflows are visible in CLI and VSCode extension.
- Fetch is available per workflow (CLI + extension action).
- Global refresh in extension maps to list refresh.
- Workflow-row trash action is removed.
- Documentation consistently reflects git-like paradigm and deprecated concepts.
