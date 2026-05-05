# Backlog: Checkpoint Restore/Delete Feature Investigation

**Date:** 2026-05-05
**Status:** Blocked

## Issue

Checkpoint restore and delete buttons in the Agent Workbench produce no visible effects. Additionally, an error is thrown:

```
ERROR: Cannot read "image.png" (this model does not support image input)
```

## Observations

1. The error originates from the Yagr agent runtime when processing checkpoint data during `restoreCheckpoint` operation
2. The checkpoint data may contain image references that the current model cannot process
3. When an error occurs, the catch block in `agent-workbench-webview.ts` only sends an error stream event but doesn't trigger a UI state refresh, causing the UI to appear unresponsive

## What Was Tried

- Added `postWorkbenchState()` call in the error catch block to refresh UI on error
- This ensured errors were displayed and UI refreshed, but didn't fix the underlying checkpoint data issue

## Root Cause (Suspected)

The Yagr agent's checkpoint data contains references to images or image data that gets processed when restoring a checkpoint. If the model doesn't support image input, this causes the error.

## Next Steps

1. Investigate how checkpoint data is serialized/deserialized in the Yagr runtime
2. Determine if checkpoint data contains actual image binary data or just image references
3. Check if the model being used supports vision/image input
4. Consider adding a pre-check before restore to verify model capabilities
5. Potentially filter out image data from checkpoint payloads if not needed for the use case

## References

- `packages/vscode-extension/src/services/agent-runtime-controller.ts` - `restoreCheckpoint()`, `deleteCheckpoint()`
- `packages/vscode-extension/src/ui/agent-workbench-webview.ts` - message handler
- `packages/vscode-extension/src/ui/agent-workbench-html.ts` - checkpoint UI
