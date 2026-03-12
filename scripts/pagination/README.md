# Pagination Test Scripts

These scripts help seed and clean workflows on an n8n instance for pagination testing.

## Create workflows

```bash
node scripts/pagination/create-workflows.cjs --env .env.test --count 150 --prefix "Auto Workflow "
```

Example generated names:
- `Auto Workflow 001 Support Invoice Review Slack`
- `Auto Workflow 002 Priority IT Contract Validation`
- `Auto Workflow 003 Europe Legal Vendor Sync`
- `Auto Workflow 004 Internal KPI Digest Email`
- `Auto Workflow 005 Daily Product Lead Routing API`

## Delete workflows (dry run)

```bash
node scripts/pagination/delete-auto-workflows.cjs --env .env.test --prefix "Auto Workflow "
```

## Delete workflows (confirmed)

```bash
node scripts/pagination/delete-auto-workflows.cjs --env .env.test --confirm --prefix "Auto Workflow "
```

Notes:
- The default prefix is "Auto Workflow ".
- Workflow names stay prefix-searchable, but now include varied business-friendly descriptors for search testing.
- Set `NAME_STYLE=legacy` in the env file to get the previous numeric-only naming back.
- The scripts read `N8N_HOST` and `N8N_API_KEY` (or equivalents) from the provided env file.
- Self-signed certificates are allowed via the HTTPS agent.
