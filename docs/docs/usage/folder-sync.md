---
title: Folder Sync
---

# Folder Sync

`folderSync` mirrors your local directory structure onto n8n: a workflow stored at
`Reports/Weekly/summary.workflow.ts` is created — or moved — into the `Reports/Weekly`
folder on the instance, creating the folders if they do not exist yet.

Out of the box it is **push-only** over n8n's public API — that direction is a
property of the API, not a choice we made. An **optional session-auth source** can
additionally reconstruct the nested layout on `pull` (see
[Reading folders on pull](#reading-folders-on-pull-optional)). Read the sections
below before enabling it, because they determine what you can expect from `pull`.

## What works, and what cannot

| Operation | Supported | Since |
| --- | --- | --- |
| List a project's folders | Yes | n8n 2.19 |
| Create a folder | Yes | n8n 2.19 |
| Create a workflow inside a folder | Yes | n8n 2.32 |
| Move a workflow between folders, or back to the root | Yes | n8n 2.32 |
| Read which folder a workflow is in | **No** | — |

The last row is the one that shapes everything else. In n8n's public API,
`parentFolderId` is declared `writeOnly`: the workflow read endpoints never load the
folder relation, and no endpoint maps workflows to folders. This is true on every
edition, self-hosted and Cloud, **including Enterprise** — it is a missing endpoint,
not a licence gate.

Consequences:

- **Push** carries your folder layout to n8n. This direction is complete.
- **Pull** cannot restore it over the public API: a workflow created in the n8n UI
  inside a folder is pulled to the root of your workflows directory. Move it where
  you want it once, and the next push pins that placement on n8n. (With the optional
  session source configured, pull instead reconstructs the nested layout — see
  [Reading folders on pull](#reading-folders-on-pull-optional).)
- Workflows already tracked in `.n8n-state.json` keep their local path across pulls,
  so an existing nested layout is never flattened.
- `n8nac status` cannot report "someone moved this workflow in the UI". Drift in that
  direction is invisible until the next push overwrites it.

## Requirements

- **n8n 2.32 or newer** to place workflows in folders. On older versions the push
  still succeeds: n8n rejects the field, n8nac retries without it, and the workflow
  lands at the project root with a warning.
- **Folders enabled on the instance.** Folders are unlocked by registering the
  Community edition (free, email registration) and are present on all paid plans. On
  an unregistered instance the folder endpoints answer `403` and n8nac degrades to a
  flat push with a warning.
- **An API key only, to push.** No session login is required to push folders. The
  project id is read from a workflow's `shared[]` payload, so the Enterprise-gated
  `GET /api/v1/projects` endpoint is never called. Reconstructing folders on *pull*
  is the one thing that needs more — see [Reading folders on pull](#reading-folders-on-pull-optional).

## Configuration

Both flags live on the workspace environment in `n8nac-config.json`:

```json
{
  "environments": [
    {
      "name": "prod",
      "folderSync": true,
      "folderSyncMoveToRoot": false
    }
  ]
}
```

`folderSync` (default `false`)
: Mirror local folders onto n8n when pushing.

`folderSyncMoveToRoot` (default `false`)
: Also move a workflow **out** of its remote folder when its local file sits at the
root of the workflows directory (sends `parentFolderId: null`).

Leave `folderSyncMoveToRoot` off unless the repository is the sole source of truth
for organisation. With it off, a push only ever places workflows the repository has
an opinion about, and never undoes a folder someone created in the n8n UI. With it
on, the repository layout wins outright: local root means project root.

## Reading folders on pull (optional)

Because the public API never returns a workflow's folder (the table above), `pull`
normally lays workflows out flat. If you want `pull` to **reconstruct the nested
layout** — to seed a fresh checkout, or to place new and remote-only workflows into
their folders — n8nac can read the folder tree over n8n's internal `/rest` API,
which the editor itself uses and which works on every edition.

As on the public path, workflows already tracked in `.n8n-state.json` keep their
local path across pulls: this reconstructs folders for workflows not yet tracked
locally; it does not relocate a tracked workflow that was moved between folders in
the n8n UI.

This path uses **session (cookie) auth**, so it is opt-in. Log in once and n8nac
stores the resulting session cookie locally — kept until its server-issued expiry
(n8n's default is ~7 days), and never the password:

```bash
# read the password from stdin (keeps it out of process listings / shell history)
n8nac env auth folder-login prod --user you@example.com --password-stdin

# remove the stored session again
n8nac env auth folder-logout prod
```

The stored cookie is a bearer credential. It lives in the same local secret store as
your API keys (honouring `N8N_MANAGER_HOME`), `n8nac env auth clear` removes it along
with the API key, and it is redacted from command output.

### Credentials via environment (CI)

Instead of a stored cookie you can supply credentials or a token through the
environment — never committed:

| Variable | Purpose |
| --- | --- |
| `N8NAC_ENV_<ENV>_FOLDER_USER` / `_FOLDER_PASS` | Per-environment login credentials |
| `N8NAC_ENV_<ENV>_FOLDER_TOKEN` | Per-environment session cookie / JWT |
| `N8NAC_FOLDER_LOGIN_USER` / `_PASS` / `_TOKEN` | Generic fallback |

`<ENV>` is the environment name upper-cased with non-alphanumerics turned into `_`
(e.g. `prod` → `PROD`). A stored cookie is tried first, then the env token; if both
are rejected and credentials are present, n8nac logs in again automatically.

### Failure behaviour

If a session source **is** configured but the load fails (revoked cookie, wrong
credentials, unreachable `/rest`), `pull` **fails closed** with an actionable error
rather than silently falling back to a flat layout — a silent flat pull would
produce a large, misleading diff when reconciling. To allow the flat fallback
instead (warn and continue), set `N8NAC_FOLDER_ALLOW_FLAT_FALLBACK=1` (or the
per-environment `N8NAC_ENV_<ENV>_FOLDER_ALLOW_FLAT`).

### Security

The password is used only to mint the cookie and is never stored. Prefer
`--password-stdin` over `--password`, which can be visible in process listings and
shell history. When the host is a non-loopback `http://` URL, n8nac warns that the
password and cookie travel in cleartext — use HTTPS.

`/rest` is an **internal, unsupported** n8n API: it is not covered by n8n's public
API stability guarantees and may change between versions. n8nac uses it only to read
folder membership; every write still goes through the public API.

## Naming

Folder names are sanitised into path segments: filesystem-unsafe characters are
replaced, Windows reserved names are escaped, and two sibling folders whose names
collide case-insensitively are disambiguated with a short id suffix. The mapping is
deterministic, so the same remote tree always produces the same local paths.
