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

No instance at hand? With Docker running, this starts a throwaway one and writes the file from the repository root:

```bash
node scripts/start-test-n8n.mjs n8n@2.41.7 > .env.test
```

Optional variables:

```bash
# none
```

The live suite intentionally stays agnostic about project naming and automatically selects the default personal project, matching the non-interactive init behavior.

## CI

The CI and nightly workflows run the live suite against a throwaway n8n started in Docker by `scripts/start-test-n8n.mjs`, at the n8n stable version they resolve. No secret is needed.

## Current Coverage

- Unit behavior around config and sync-manager contracts.
- Mocked sync scenarios for listing, pull/push orchestration, and conflict handling.
- Live sync scenarios for the real git-like engine against an actual n8n backend.
