# Tests

This directory contains the test suite for the `@n8n-as-code/sync` package.

## 📁 Test Structure

```
tests/
├── unit/                      # Unit tests (fast, no external dependencies)
│   ├── workflow-sanitizer.test.ts
│   ├── state-manager.test.ts
│   ├── watcher-robustness.test.ts
│   └── ...
├── integration/               # Integration tests (requires n8n instance)
│   ├── pagination.test.ts
│   ├── robust-sync.test.ts
│   └── sync-manager-project-scope.test.ts
├── helpers/                   # Test utilities and helpers
│   ├── test-cleanup.ts       # Cleanup utilities for integration tests
│   └── project-helpers.test.ts
├── TEST-CLEANUP-GUIDE.md     # Guide for proper test cleanup
└── README.md                 # This file
```

## 🏃 Running Tests

### All Tests

```bash
npm test
```

### Unit Tests Only (Fast)

```bash
npm run test:unit
```

### Integration Tests Only (Requires n8n instance)

```bash
npm run test:integration
```

## 🧪 Test Categories

### Unit Tests

- **Fast**: No external dependencies
- **Isolated**: Mock all external services
- **Deterministic**: Same input = same output
- **No Cleanup Required**: Tests only in-memory data

**Examples:**
- `workflow-sanitizer.test.ts` - Tests JSON cleaning logic
- `state-manager.test.ts` - Tests state persistence
- `directory-utils.test.ts` - Tests file path utilities

### Integration Tests

- **Slower**: Hit real n8n API
- **Require Setup**: Need `.env.test` with credentials
- **Stateful**: Create/modify workflows on n8n instance
- **Cleanup Required**: Must clean up created workflows

**Examples:**
- `pagination.test.ts` - Tests large workflow pagination
- `robust-sync.test.ts` - Tests full sync lifecycle
- `sync-manager-project-scope.test.ts` - Tests project scoping

## ⚙️ Integration Test Setup

### 1. Create `.env.test`

Create a `.env.test` file in the project root:

```bash
N8N_HOST=http://localhost:5678
N8N_API_KEY=your_api_key_here
```

### 2. Verify n8n Instance

Ensure your n8n instance is:
- Running and accessible
- Has API access enabled
- Has at least one project (Personal)

### 3. Run Tests

```bash
npm run test:integration
```

## 🧹 Test Cleanup

**CRITICAL:** Integration tests MUST clean up created workflows.

### Why?

Without cleanup:
- ❌ Test workflows pollute n8n instance
- ❌ Makes debugging difficult
- ❌ Can hit workflow limits
- ❌ Confuses real vs test data

### How?

Use cleanup helpers from `helpers/test-cleanup.ts`:

```typescript
import { cleanupTestWorkflows } from '../helpers/test-cleanup.js';

before(async () => {
    await cleanupTestWorkflows(client, ['Test Workflow'], projectId);
});

after(async () => {
    await cleanupTestWorkflows(client, ['Test Workflow'], projectId);
});
```

📚 **See [TEST-CLEANUP-GUIDE.md](./TEST-CLEANUP-GUIDE.md) for complete guide**

## 📝 Writing New Tests

### Unit Test Template

```typescript
import test from 'node:test';
import assert from 'node:assert';

test('MyService: should do something', () => {
    const result = myService.doSomething();
    assert.strictEqual(result, expected);
});
```

### Integration Test Template

```typescript
import test, { before, after } from 'node:test';
import { N8nApiClient } from '../../src/services/n8n-api-client.js';
import { cleanupTestWorkflows } from '../helpers/test-cleanup.js';

const TEST_NAME = 'My Integration Test Workflow';

test('My integration test', async (t) => {
    let client: N8nApiClient;
    let projectId: string;

    before(async () => {
        client = new N8nApiClient({ host, apiKey });
        const projects = await client.getProjects();
        projectId = projects[0].id;
        
        // Cleanup before
        await cleanupTestWorkflows(client, [TEST_NAME], projectId);
    });

    after(async () => {
        // Cleanup after
        await cleanupTestWorkflows(client, [TEST_NAME], projectId);
    });

    await t.test('test case', async () => {
        // Your test logic
    });
});
```

## 🔍 Test Guidelines

### Do ✅

- Write descriptive test names
- Test one thing per test
- Use `test.skip()` for conditional tests
- Clean up integration test data
- Mock external services in unit tests
- Use helpers for common operations

### Don't ❌

- Skip cleanup in integration tests
- Use generic workflow names
- Create unnecessary workflows
- Hard-code credentials in tests
- Rely on test execution order
- Test implementation details

## 🚨 Common Issues

### Integration Tests Failing

**Problem:** Tests fail with "N8N_API_KEY not found"

**Solution:** 
1. Create `.env.test` in project root
2. Add `N8N_HOST` and `N8N_API_KEY`
3. Verify n8n instance is running

### Tests Polluting n8n Instance

**Problem:** Test workflows accumulate on n8n

**Solution:**
1. Add cleanup in `before()` and `after()` hooks
2. Use `cleanupTestWorkflows()` helper
3. Run tests multiple times to verify cleanup

### Flaky Integration Tests

**Problem:** Tests pass sometimes, fail other times

**Solution:**
1. Add delays for async operations: `await new Promise(r => setTimeout(r, 1000))`
2. Use retries: `for (let i = 0; i < 3; i++) { ... }`
3. Clean up state before tests

## 📊 Test Coverage

Run tests with coverage:

```bash
npm run test -- --coverage
```

Coverage reports are in `coverage/` directory.

## 🤝 Contributing

When adding tests:

1. ✅ Choose appropriate category (unit vs integration)
2. ✅ Follow naming conventions
3. ✅ Add cleanup for integration tests
4. ✅ Update this README if adding new patterns
5. ✅ Ensure tests pass locally before committing

## 📚 Related Documentation

- [TEST-CLEANUP-GUIDE.md](./TEST-CLEANUP-GUIDE.md) - Detailed cleanup guide
- [../../docs/contribution/sync.md](../../docs/contribution/sync.md) - Sync package architecture
- [../../TESTING.md](../../TESTING.md) - Project-wide testing guide

## ❓ Need Help?

- Check existing tests for examples
- Read the cleanup guide
- Ask in project discussions
- Report issues on GitHub
