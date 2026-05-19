# Native Environment Promotion Plan

## Summary

Implement native multi-environment promotion for `n8nac promote` while preserving the current single-workflow flow.

Supported entrypoints:

```bash
n8nac promote <path> --from Dev --to Prod
n8nac promote --from Dev --to Prod --dry-run
```

Promotion uses local `.workflow.ts` files from the source environment sync scope as the source of truth. It plans the target changes first, resolves environment-specific workflow and credential IDs, transforms workflows through structured JSON, then writes target workflow files and pushes them unless `--no-push` is used.

The identity model is "state plus names": discover target objects by stable names for the first promotion, then persist source-to-target bindings in `n8nac-promotion.json` so later promotions update the same target objects.

## Key Changes

- Extend `n8nac promote` so the positional workflow path is optional.
- Keep single-file promotion compatibility when a path is provided.
- Promote all direct `.workflow.ts` files from the source workflow directory when no path is provided.
- Add optional `--promotion-config <path>`, defaulting to `n8nac-promotion.json`.
- Add a planning phase that loads source/target environments, inventories workflows and credentials, resolves bindings, and reports missing or ambiguous references before writing.
- Add structured remapping for:
  - workflow metadata (`id`, project metadata, archived metadata),
  - node credential references,
  - supported workflow-to-workflow references in Execute Workflow nodes.
- Persist promotion routes and bindings in `n8nac-promotion.json`.

## Configuration

`n8nac-promotion.json` starts with this v1 shape:

```json
{
  "version": 1,
  "routes": {
    "Dev->Prod": {
      "bindings": {
        "workflows": {},
        "credentials": {}
      },
      "workflowOverrides": {},
      "credentialOverrides": {},
      "nameRules": []
    }
  }
}
```

Rules:

- Existing bindings win.
- Overrides are used for explicit exceptions.
- Unique target name matches are used for first discovery.
- Name rules are optional conveniences, not the source of truth.
- Missing or ambiguous references block promotion by default.
- Credentials are never created automatically in v1.

## CLI Behavior

- `--dry-run` does not write workflow files, does not push, and does not update `n8nac-promotion.json`.
- Normal promotion writes transformed files into the target workflow directory and pushes them unless `--no-push` is set.
- Successful pushes update promotion bindings with the target workflow IDs.
- `--overwrite` is only required when a target file exists but cannot be associated with a resolved target workflow.
- `--json` returns a structured plan/result with summary counts, workflow actions, substitutions, and blocking problems.

## Tests

- Unit tests for path compatibility and environment-wide promotion selection.
- Unit tests for dry-run side effects.
- Unit tests for credential mapping by type/name, overrides, ambiguity, and missing credentials.
- Unit tests for workflow binding, target-name discovery, and first-create behavior.
- Unit tests for workflow transformation through TS -> JSON -> TS.
- CLI-level tests with mocked clients; no live n8n dependency.

## Assumptions

- V1 supports TypeScript workflow files only.
- The local source sync scope is the source of truth, not the remote source instance.
- Execute Workflow node references are the only workflow-to-workflow references remapped in v1.
- Promotion keeps the workflow `active` value from the source workflow.
- Credentials must already exist in the target environment or be mapped through overrides.
