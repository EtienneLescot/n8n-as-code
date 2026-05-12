---
sidebar_label: Troubleshooting
title: Troubleshooting
description: Fix common n8n-as-code issues with environments, sync, VS Code, Claude, OpenClaw, and the CLI.
---

# Troubleshooting

Start by checking the active environment:

```bash
n8nac env list
n8nac env status
n8nac workspace status
```

## Connection And Authentication

### Cannot connect to n8n

Verify the URL:

```bash
curl -I https://your-n8n-instance.com
```

Refresh the local API key for the environment:

```bash
n8nac env auth set <environment> --api-key-stdin
```

### Invalid API key

- Regenerate the key in n8n Settings -> API.
- Store it again with `n8nac env auth set <environment> --api-key-stdin`.
- Confirm the API key has access to the selected project.

## Missing Configuration

### `n8nac-config.json` not found

Create an environment:

```bash
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
```

Or attach a local managed instance:

```bash
n8n-manager instance list
n8nac env add Local --managed-instance <id> --sync-folder workflows/local
n8nac env use Local
```

## VS Code Extension

### Workflows do not load

- Confirm the workspace has an environment in **n8n environments**.
- Confirm the remote environment has a local API key.
- Refresh the n8n sidebar.
- Check the **n8n-as-code** Output panel.

### Canvas does not show

- Verify the n8n URL in the active environment.
- Confirm the API key is valid.
- Reopen the split view.

### Migration banner appears

Use the explicit button in the extension or run:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
n8nac env status --json
```

Review the dry-run `operations` list before applying. `workspace migrate --write` applies all required migration operations together.

If the migration banner remains after applying, inspect the remaining migration plan:

```bash
n8nac workspace migrate --json
n8nac workspace migrate --write
```

## Sync Issues

### Push or pull fails with conflict

Both sides changed since the last synced base.

```bash
n8nac resolve <workflow-id> --mode keep-current
n8nac resolve <workflow-id> --mode keep-incoming
```

In VS Code, use the conflict actions in the tree.

### Changes made in n8n UI are not local

```bash
n8nac list
n8nac pull <workflow-id>
```

### Push rejected by OCC

The remote changed since your last pull. Pull first or resolve the conflict intentionally.

## Managed Local Instances

Local managed instances are local machine resources. They are not created or deleted by `n8nac env remove`.

```bash
n8n-manager instance list
n8n-manager instance start <id>
n8n-manager instance stop <id>
n8n-manager tunnel start <id>
n8n-manager tunnel stop <id>
```

If a workspace environment references a missing local managed instance, recreate it or point the environment to a remote n8n URL:

```bash
n8nac env update <environment> --base-url <url>
n8nac env auth set <environment> --api-key-stdin
```

## Claude Plugin

### Plugin not recognized

Install with the full HTTPS marketplace URL:

```text
/plugin marketplace add https://github.com/EtienneLescot/n8n-as-code
/plugin install n8n-as-code@n8nac-marketplace
```

Restart Claude Code after installation.

### Claude lacks n8n context

```bash
n8nac update-ai
```

Confirm `AGENTS.md` exists and points to the generated skills.

## OpenClaw Plugin

### Setup fails

```bash
openclaw plugins install @n8n-as-code/n8nac
openclaw n8nac:setup
openclaw gateway restart
```

If you migrated from the old package name, uninstall it first:

```bash
openclaw plugins uninstall n8nac
openclaw plugins install @n8n-as-code/n8nac
```

## CLI Package Conflicts

If `n8nac --help` shows old commands, remove the deprecated package:

```bash
npm uninstall -g @n8n-as-code/cli
n8nac --version
n8nac --help
```

The current package is `n8nac`.

## Complete Reset

Back up workflows first, then recreate the environment:

```bash
cp -r workflows workflows-backup-$(date +%Y%m%d)
rm n8nac-config.json
n8nac env add Dev --base-url <url> --sync-folder workflows/dev
n8nac env auth set Dev --api-key-stdin
n8nac env use Dev
n8nac list
```

## Still Stuck

Include this output when asking for help:

```bash
n8nac --version
node --version
n8nac env list
n8nac env status
n8nac workspace status
```

- [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions)
- [GitHub Issues](https://github.com/EtienneLescot/n8n-as-code/issues)
