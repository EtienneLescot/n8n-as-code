# Testing the EnhancedWorkflowTreeProvider

This document describes how to test the real-time UI updates in the n8n-as-code VS Code extension.

## Overview

The `EnhancedWorkflowTreeProvider` has been significantly improved to provide real-time updates in the left panel tree view. The following features have been implemented:

1. **Cache Management**: 5-second TTL cache for workflow data
2. **Event-Driven Architecture**: Centralized `UIEventBus` for decoupled communication
3. **Granular Updates**: Update individual workflows instead of reloading all
4. **Error Handling**: Retry logic and graceful error recovery
5. **Performance Optimizations**: Caching and debouncing

## Test Scenarios

### 1. Basic UI Updates
**Scenario**: Tree view should update when workflows change
**Steps**:
1. Initialize n8n-as-code extension
2. Create a new workflow in n8n
3. Click "Pull" button
4. **Expected**: Tree view should show the new workflow immediately

### 2. Real-Time Sync Updates
**Scenario**: Tree view should update during sync operations
**Steps**:
1. Have existing workflows in the tree view
2. Modify a workflow file locally
3. Click "Push" for that workflow
4. **Expected**: Workflow status should change from "LOCAL_MODIFIED" to "SYNCED" immediately

### 3. Conflict Detection
**Scenario**: Tree view should show conflicts
**Steps**:
1. Create a conflict by modifying the same workflow locally and remotely
2. Trigger a sync operation
3. **Expected**: Workflow should appear with conflict icon and "CONFLICT" status

### 4. Deletion Handling
**Scenario**: Tree view should handle deletions gracefully
**Steps**:
1. Delete a workflow file locally
2. **Expected**: Workflow should appear with deletion pending icon
3. Click "Confirm Deletion" or "Restore"
4. **Expected**: Workflow should update accordingly

### 5. Cache Behavior
**Scenario**: Cache should prevent unnecessary API calls
**Steps**:
1. Open tree view (loads workflows)
2. Close and reopen tree view within 5 seconds
3. **Expected**: No API call to sync manager (cache hit)
4. Wait 6+ seconds and reopen
5. **Expected**: API call to sync manager (cache miss)

### 6. Event System
**Scenario**: Events should trigger UI updates
**Steps**:
1. Monitor event bus emissions in console
2. Perform any sync operation
3. **Expected**: UI events should be emitted and tree should refresh

## Manual Testing Commands

Use the following VS Code commands to test functionality:

```bash
# Refresh tree view manually
Developer: Execute Command -> "n8n.refresh"

# Test push operation
Developer: Execute Command -> "n8n.push"

# Test pull operation  
Developer: Execute Command -> "n8n.pull"

# Initialize AI context (tests tree provider integration)
Developer: Execute Command -> "n8n.initializeAI"
```

## Debugging Tips

### Enable Debug Logging
Add to `extension.ts`:
```typescript
// In initializeSyncManager function
syncManager.on('log', (msg) => {
    console.log('[SyncManager]', msg);
    outputChannel.appendLine(`[SyncManager] ${msg}`);
});
```

### Monitor Event Bus
Add to any component:
```typescript
import { getEventBus, UIEventType } from './services/ui-event-bus.js';

const bus = getEventBus();
bus.on(UIEventType.UI_REFRESH_NEEDED, (payload) => {
    console.log('UI refresh needed:', payload);
});
```

### Check Cache State
The `EnhancedWorkflowTreeProvider` has these cache-related properties:
- `lastReloadTime`: Timestamp of last data reload
- `isCacheStale()`: Returns true if cache > 5 seconds old
- `cachedTreeItems`: Cached tree items (1-second TTL)

## Automated Testing Considerations

While full unit tests require mocking VS Code API, here are key testable components:

### 1. UIEventBus Tests
```typescript
// Test event emission and subscription
const bus = new UIEventBus();
let receivedEvent = false;
bus.on(UIEventType.UI_REFRESH_NEEDED, () => {
    receivedEvent = true;
});
bus.emit(UIEventType.UI_REFRESH_NEEDED, {});
assert(receivedEvent === true);
```

### 2. Cache Logic Tests
```typescript
// Test cache staleness
provider.lastReloadTime = Date.now() - 6000; // 6 seconds ago
assert(provider.isCacheStale() === true);

provider.lastReloadTime = Date.now() - 3000; // 3 seconds ago  
assert(provider.isCacheStale() === false);
```

### 3. Granular Update Tests
```typescript
// Test updating single workflow
const workflowId = 'test-123';
const updates = { status: 'SYNCED' as any };
await provider.updateWorkflowStatus(workflowId, updates);
assert(provider.workflows.find(w => w.id === workflowId)?.status === 'SYNCED');
```

## Performance Metrics

Key metrics to monitor:
- **API Calls**: Should decrease with caching
- **UI Response Time**: Should be < 100ms for most operations
- **Memory Usage**: Should remain stable with cache cleanup

## Known Issues and Workarounds

1. **VS Code API Limitations**: Some VS Code tree provider methods can't be fully mocked
2. **Async Timing**: Event handlers may fire in unexpected order
3. **Cache Invalidation**: Manual cache invalidation may be needed in edge cases

## Conclusion

The enhanced tree provider now provides reliable real-time updates through a combination of caching, event-driven architecture, and granular updates. Test all scenarios to ensure the left panel updates correctly in response to user actions and sync operations.