# CLI Test Suite

Vitest coverage for the git-like CLI sync model.

## Test Sets

`npm test`

- Fast local suite.
- Runs unit tests, scenario tests, and lightweight mocked sync tests.
- Does not require any live n8n instance.

`npm run test:integration`

- Live integration suite against a real n8n instance.
- Loads `.env.test` automatically when present.
- Intended to validate the git-like flows before shipping: create, push, pull, conflict detection, conflict resolution, and deletion/recreation scenarios.

`npm run test:all`

- Runs every CLI Vitest file, including the live integration suite.

## Live Integration Setup

Create a `.env.test` file either at the repository root or in `packages/cli/`.

Required variables:

```bash
N8N_HOST=https://your-instance.app.n8n.cloud
N8N_API_KEY=your-api-key
```

Optional variables:

```bash
# none
```

The live suite intentionally stays agnostic about project naming and automatically selects the default personal project, matching the non-interactive init behavior.

## CI

The GitHub Actions workflow runs the live suite only when these secrets are defined:

- environment variable `N8N_HOST`
- secret `N8N_API_KEY`

## Current Coverage

- Unit behavior around config and sync-manager contracts.
- Mocked sync scenarios for listing, pull/push orchestration, and conflict handling.
- Live sync scenarios for the real git-like engine against an actual n8n backend.
