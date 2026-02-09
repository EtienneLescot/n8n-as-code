# Pagination Test Scripts

These scripts help seed and clean workflows on an n8n instance for pagination testing.

## Create workflows

```bash
node scripts/pagination/create-workflows.cjs --env .env.test --count 150 --prefix "Auto Workflow "
```

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
- The scripts read `N8N_HOST` and `N8N_API_KEY` (or equivalents) from the provided env file.
- Self-signed certificates are allowed via the HTTPS agent.
