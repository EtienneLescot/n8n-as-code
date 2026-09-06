# Release operations (RC model)

This is the operator runbook for cutting and promoting releases. The model is
the classic one: `main` takes **all** merges, and every release — stable or
candidate — is cut deliberately by a maintainer. Nothing is ever published
automatically when code lands on `main`.

- **`main`** — the integration branch. All pull requests (human and automated)
  target it. It is never frozen.
- **`release/vX.Y.Z`** — one frozen branch per stable version, created at
  `rc.1` and kept forever after promotion. Only cherry-picked bug fixes land
  on it during the RC window.

## Cut a release candidate

Run the **Prerelease (RC)** workflow (`.github/workflows/prerelease.yml`) from
the Actions tab, on `main`:

| Input | Meaning |
| --- | --- |
| `bump` | `patch`, `minor` or `major` — anchors the `n8nac` (CLI) target version |
| `rc_number` | `1` for the first cut, `2+` to re-cut an existing release branch |
| `target_version` | optional explicit `X.Y.Z` for `n8nac` (e.g. to force `3.0.0`) |

What happens:

1. Per-package target versions are computed from conventional commits since
   each package's last stable tag (internal dependencies propagate as patch
   bumps, as before).
2. The frozen branch `release/vX.Y.Z` is created from `main` (rc.1) or reused
   as-is (rc.2+ — it carries your cherry-picks, never delete it).
3. Every changed package is bumped to `X.Y.Z-rc.N` **on the release branch
   only** and committed with `[skip ci]`.
4. Packages are published to npm with the `next` dist-tag (and mirrored to `rc`),
   the VS Code extension is published as a `--pre-release` (Marketplace only — Open VSX never gets
   RCs), the tag `vX.Y.Z-rc.N` is pushed, and a GitHub **prerelease** is
   created.

Install an RC locally with:

```bash
npm install n8nac@next
# (or npm install n8nac@rc)
```
## Cherry-pick a fix during the RC window

```bash
git fetch origin
git checkout release/vX.Y.Z
git cherry-pick <fix-sha>
git push origin release/vX.Y.Z
```

Then re-run **Release** (`.github/workflows/release.yml` with `action: rc`) with the same `bump`/`target_version` and
`rc_number` + 1. The re-cut re-publishes `-rc.N+1` including the fix.

Note: the branch name is always the **stable** version (`release/v2.6.0`),
never suffixed with `-rc.N`. Suffixing the branch name breaks promote.

## Promote to stable

Run the **Release** workflow (`.github/workflows/release.yml` with `action: promote`)
with `rc_tag` = the last validated RC (e.g. `v2.6.0-rc.2`). In order:

1. The release branch is checked out and must contain the RC tag.
2. `-rc.N` suffixes are stripped, final versions and CHANGELOGs are committed
   to the release branch.
3. npm packages are published under `latest` (with provenance), the VS Code
   extension goes stable on the Marketplace **and** Open VSX.
4. Per-package tags (`n8nac@v2.6.0`, …) and the repo tag `v2.6.0` are pushed;
   a GitHub release marked latest is published. The MCP docker images build
   off the `@n8n-as-code/mcp@v*` tags — if the `docker-mcp` workflow did not
   trigger (tag pushes with `GITHUB_TOKEN` do not fire downstream events),
   dispatch it manually on the tag.
5. A sync pull request (`release/vX.Y.Z-sync` → `main`) is opened and merged
   automatically (rebase), so `main` carries the released versions and
   changelogs. If the auto-merge fails, merge that PR by hand — the release
   itself is already published and unaffected.

**Order matters:** everything that publishes runs before the main sync, so a
sync failure can never mask a release.

## Manual fallback

If a workflow is broken, the equivalent shell sequence is:

```bash
# Cut an RC
git checkout -b release/v2.6.0 origin/main
node scripts/release/workspace-release.mjs rc --bump minor --rc 1 --apply
git commit -am "chore(release): bump to 2.6.0-rc.1 [skip ci]"
git push origin release/v2.6.0

# Promote (on the release branch)
node scripts/release/workspace-release.mjs promote --apply
git commit -am "chore(release): bump to 2.6.0 [skip ci]"
git push origin release/v2.6.0
```

Dry-run any plan without applying by omitting `--apply`; the computed plan is
printed as JSON.

## Credentials and environments

Both workflows run in the `prod` GitHub environment (npm trusted publishing
needs `id-token: write` and npm ≥ 11.5.1; VS Code tokens live there). RC runs
stamp telemetry as `rc`. CI uses the legacy `next` environment purely for its
cloud regression credentials — renaming it would require recreating the
environment and re-adding its secrets.

## Invariants

- A tag containing `-` (i.e. `-rc.N`) is a prerelease everywhere: npm dist-tag
  `rc`, VS Code `--pre-release`, GitHub prerelease.
- Every published version must equal the workflow's computed target — promote
  re-asserts each package version before publishing.
- Versions and changelogs live on release branches; `main` receives them only
  through the sync PR.
- Release branches are never deleted; they are the record of what shipped and
  the base for backports.
