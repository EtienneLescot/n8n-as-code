# CLI Test Suite

Comprehensive test suite for the n8n-as-code CLI package using **Vitest**.

## 🎯 Test Coverage

### ✅ Integration Tests (4 files, ~40+ tests)

#### 1. `integration/pull-refreshstate.test.ts` (3 tests)
Tests the **Sync bug workaround**: Pull/Push commands must call `refreshState()` before sync operations.

- ✅ Verifies refreshState is called before syncDown
- ✅ Verifies refreshState is called before syncUp  
- ✅ Tests force pull behavior

#### 2. `integration/restore-deleted-file.test.ts` (4 tests)
Tests the **restore workaround**: Using `resolveConflict()` instead of `restoreLocalFile()` for manually deleted files.

- ✅ Uses resolveConflict instead of restoreLocalFile
- ✅ Handles files not in archive
- ✅ Restores multiple files
- ✅ Handles errors gracefully

#### 3. `integration/delete-with-backup.test.ts` (5 tests)
Tests the **backup guarantee**: Ensuring files are backed up before deletion on n8n.

- ✅ Ensures file is in archive before deletion
- ✅ Moves file to archive during watch deletion
- ✅ Handles manual deletion without archive
- ✅ Prevents n8n deletion if backup fails
- ✅ Preserves backup after deletion

#### 4. `scenarios/sync-scenarios.test.ts` (24+ tests)
End-to-end synchronization scenarios covering all workflow states.

**Covered scenarios:**
- Initial Sync (2 tests)
- Conflict Resolution (3 tests)
- Status Detection (8 tests)
  - IN_SYNC
  - MODIFIED_LOCALLY
  - MODIFIED_REMOTELY
  - DELETED_LOCALLY
  - DELETED_REMOTELY
  - EXIST_ONLY_LOCALLY
  - EXIST_ONLY_REMOTELY
  - CONFLICT
- Bidirectional Sync (3 tests)
- Error Handling (2 tests)
- Performance (1 test)

### ✅ Unit Tests (2 files, ~15+ tests)

#### 5. `unit/config-service.test.ts` (~12 tests)
Tests for configuration management (local config, API keys, instance identifiers).

- ✅ getLocalConfig (3 tests)
- ✅ saveLocalConfig (1 test)
- ✅ getApiKey (4 tests)
- ✅ saveApiKey (3 tests)
- ✅ hasConfig (3 tests)
- ✅ getOrCreateInstanceIdentifier (2 tests)
- ✅ getInstanceConfigPath (1 test)

#### 6. `unit/cli-helpers.test.ts` (~5 tests)
Tests for CLI utility functions (diff display, log buffering).

- ✅ showDiff (3 tests)
- ✅ flushLogBuffer (3 tests)

## 🛠 Test Infrastructure

### Helpers (`helpers/test-helpers.ts`)
Provides mock implementations for testing:

- **MockN8nApiClient**: Mocks Sync's N8nApiClient
- **MockSyncManager**: Mocks Sync's SyncManager
- **MockConfigService**: Mocks ConfigService
- **createMockWorkflow()**: Factory for test workflows
- **mockInquirerPrompt()**: Mocks user prompts
- **suppressConsole()**: Suppresses console output during tests

### Fixtures
- `fixtures/sample-workflow.json`: Sample workflow for testing
- `fixtures/sample-config.json`: Sample config for testing

## 🚀 Running Tests

### Install dependencies
```bash
cd packages/cli
npm install
```

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npx vitest run tests/integration/pull-refreshstate.test.ts
```

### Run tests matching pattern
```bash
npx vitest run -t "pull"
```

## 📊 Expected Results

All tests should pass:
- **Total**: ~60+ tests
- **Integration**: ~40 tests
- **Unit**: ~20 tests

## 🔧 Technology Stack

- **Test Framework**: Vitest (v1.1.0)
- **Mocking**: Vitest built-in mocking (vi.fn, vi.mock, vi.spyOn)
- **Coverage**: @vitest/coverage-v8

## ✨ Key Improvements Over Jest

Vitest was chosen over Jest because:
1. ✅ **Native ESM support** - Works with modern ESM packages (chalk, conf, inquirer)
2. ✅ **Faster execution** - Uses Vite's transformation pipeline
3. ✅ **Better DX** - Hot module replacement for tests
4. ✅ **Compatible API** - Similar to Jest, easy migration

## 🐛 Tests Cover These Critical Bugs

### Bug 1: syncDown/syncUp don't refresh state
**Workaround**: Call `refreshState()` before `syncDown()` and `syncUp()`
**Tested in**: `pull-refreshstate.test.ts`

### Bug 2: restoreLocalFile fails for manually deleted files
**Workaround**: Use `resolveConflict(id, filename, 'remote')` instead
**Tested in**: `restore-deleted-file.test.ts`

### Bug 3: deleteRemoteWorkflow requires file in archive
**Workaround**: Ensure backup exists before deletion
**Tested in**: `delete-with-backup.test.ts`

## 📝 Test Status

✅ **All tests implemented and ready to run**

The tests were recreated from a previous session where 37 tests were passing. The current implementation uses Vitest instead of Jest to resolve ESM compatibility issues.

## 🔍 Next Steps

To extend test coverage:
1. Add tests for `BaseCommand`
2. Add tests for `InitCommand`
3. Add tests for `ListCommand`
4. Add tests for `StartCommand`
5. Add more edge case scenarios
6. Aim for >80% code coverage

## 📚 References

- [Vitest Documentation](https://vitest.dev/)
- [n8n-as-code Sync API](../../../packages/sync/README.md)
- [CLI Specification](../../../SPECS/REFACTO_CLI.md)
