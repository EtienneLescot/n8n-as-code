---
title: Folder Sync
---

# Folder Sync

`folderSync` mirrors your local directory structure onto n8n: a workflow stored at
`Reports/Weekly/summary.workflow.ts` is created — or moved — into the `Reports/Weekly`
folder on the instance, creating the folders if they do not exist yet.

It is **push-only**, and that is a property of n8n's public API rather than a choice
we made. Read the section below before enabling it, because it determines what you
can expect from `pull`.

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
- **Pull** cannot restore it. A workflow created in the n8n UI inside a folder is
  pulled to the root of your workflows directory. Move it where you want it once,
  and the next push pins that placement on n8n.
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
- **An API key only.** No session login is required. The project id is read from a
  workflow's `shared[]` payload, so the Enterprise-gated `GET /api/v1/projects`
  endpoint is never called.

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

## Naming

Folder names are sanitised into path segments: filesystem-unsafe characters are
replaced, Windows reserved names are escaped, and two sibling folders whose names
collide case-insensitively are disambiguated with a short id suffix. The mapping is
deterministic, so the same remote tree always produces the same local paths.
