---
sidebar_label: Core Package
title: Core Package - Shared Library
description: Documentation for the Core package that provides shared business logic for all n8n-as-code components.
---

# Core Package - Shared Library Documentation

**Note**: This package is a shared dependency used by all other n8n-as-code packages. It provides the foundational services for workflow management.

## 🎯 Purpose

The Core package (`@n8n-as-code/core`) provides the shared business logic and services used by:
- **VS Code Extension**: For workflow synchronization and management
- **CLI**: For command-line operations
- **Agent CLI**: For AI context generation

It encapsulates all n8n API interactions, state management, and synchronization logic.

## 🏗️ Architecture

### Service Layer Architecture
```mermaid
graph TD
    A[SyncManager] --> B[StateManager]
    A --> C[N8nApiClient]
    A --> D[WorkflowSanitizer]
    A --> E[DirectoryUtils]
    A --> F[TrashService]
    
    B --> G[Local State]
    C --> H[n8n API]
    D --> I[Validation]
    E --> J[File System]
    F --> K[Trash Management]
    
    style A fill:#ff6b35
    style B fill:#3498db
    style C fill:#2ecc71
    style D fill:#9b59b6
```

### Package Dependencies
```json
{
  "dependencies": {
    "axios": "^1.6.0",          // HTTP client for n8n API
    "fs-extra": "^11.1.1",      // Enhanced file system operations
    "json-schema": "^0.4.0",    // JSON Schema validation
    "chokidar": "^3.5.3"        // File watching
  }
}
```

## 🧩 Core Services

### 1. **SyncManager**
The central service that orchestrates synchronization between n8n and local files.

**Key Responsibilities:**
- Manage sync operations (pull, push, full sync)
- Handle conflict detection and resolution
- Coordinate between different sync modes
- Provide progress reporting and error handling

**Interface:**
```typescript
interface SyncManager {
  sync(options: SyncOptions): Promise<SyncResult>;
  pull(options: PullOptions): Promise<PullResult>;
  push(options: PushOptions): Promise<PushResult>;
  watch(options: WatchOptions): Promise<Watcher>;
  resolveConflict(conflict: Conflict): Promise<Resolution>;
}
```

### 2. **StateManager**
Tracks and manages the state of workflows across local and remote.

**Key Responsibilities:**
- Maintain workflow state (local vs remote)
- Detect changes and modifications
- Track sync status and history
- Provide state persistence

**State Model:**
```typescript
interface WorkflowState {
  id: string;
  name: string;
  localPath: string;
  remoteId?: string;
  localHash: string;
  remoteHash?: string;
  lastSync: Date;
  status: 'synced' | 'modified' | 'conflict' | 'error';
  conflicts?: Conflict[];
}
```

### 3. **N8nApiClient**
Communicates with the n8n REST API.

**Key Responsibilities:**
- Handle authentication and API key management
- Make HTTP requests to n8n endpoints
- Handle rate limiting and retries
- Parse and validate API responses

**API Endpoints:**
```typescript
interface N8nApiClient {
  // Workflow operations
  getWorkflows(): Promise<Workflow[]>;
  getWorkflow(id: string): Promise<Workflow>;
  createWorkflow(workflow: Workflow): Promise<Workflow>;
  updateWorkflow(id: string, workflow: Workflow): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  
  // Instance operations
  getInstances(): Promise<Instance[]>;
  getInstance(id: string): Promise<Instance>;
  
  // Health check
  healthCheck(): Promise<HealthStatus>;
}
```

### 4. **WorkflowSanitizer**
Validates and sanitizes workflow JSON.

**Key Responsibilities:**
- Validate workflow structure against n8n schema
- Remove sensitive data (credentials, API keys)
- Normalize workflow format
- Fix common issues and inconsistencies

**Sanitization Process:**
```typescript
interface WorkflowSanitizer {
  sanitize(workflow: any): SanitizedWorkflow;
  validate(workflow: any): ValidationResult;
  normalize(workflow: any): NormalizedWorkflow;
  removeCredentials(workflow: any): CredentialFreeWorkflow;
}
```

### 5. **DirectoryUtils**
Manages file system operations for workflows.

**Key Responsibilities:**
- Create and manage workflow directory structure
- Handle file I/O operations
- Organize workflows by instance
- Provide path utilities

**Directory Structure:**
```
workflows/
├── instance1/
│   ├── workflow-a.json
│   └── workflow-b.json
├── instance2/
│   └── workflow-c.json
└── .state.json
```

### 6. **TrashService**
Manages deleted workflows and provides recovery.

**Key Responsibilities:**
- Move deleted workflows to trash
- Provide trash management operations
- Support workflow recovery
- Automatic trash cleanup

## 🔄 Sync Process

### Full Sync Flow
```mermaid
sequenceDiagram
    participant User
    participant SyncManager
    participant StateManager
    participant N8nApiClient
    participant DirectoryUtils
    
    User->>SyncManager: sync()
    SyncManager->>StateManager: getState()
    StateManager-->>SyncManager: current state
    
    SyncManager->>N8nApiClient: getWorkflows()
    N8nApiClient-->>SyncManager: remote workflows
    
    SyncManager->>DirectoryUtils: readLocalWorkflows()
    DirectoryUtils-->>SyncManager: local workflows
    
    SyncManager->>StateManager: compareStates()
    StateManager-->>SyncManager: changes detected
    
    loop For each change
        SyncManager->>SyncManager: applyChange()
    end
    
    SyncManager->>StateManager: updateState()
    SyncManager-->>User: sync completed
```

### Conflict Resolution
1. **Detection**: StateManager detects hash mismatch
2. **Analysis**: Determine conflict type (edit/edit, delete/edit, etc.)
3. **Notification**: Report conflict to user
4. **Resolution**: Apply resolution strategy
5. **Sync**: Continue with resolved workflow

## 📊 State Management

### State File Structure
```json
{
  "version": "1.0.0",
  "workflows": {
    "workflow-id-1": {
      "id": "workflow-id-1",
      "name": "My Workflow",
      "localPath": "workflows/instance1/my-workflow.json",
      "remoteId": "123",
      "localHash": "abc123",
      "remoteHash": "def456",
      "lastSync": "2024-01-13T09:41:02.177Z",
      "status": "synced"
    }
  },
  "instances": {
    "instance1": {
      "host": "https://n8n.example.com",
      "lastSync": "2024-01-13T09:41:02.177Z"
    }
  }
}
```

### State Operations
- **Read State**: Load from `.state.json`
- **Update State**: Modify and save state
- **Merge States**: Combine multiple state sources
- **Validate State**: Ensure state consistency

## 🔐 Security

### Credential Handling
- **Never Store**: Credentials are never stored in state or files
- **API Key Encryption**: API keys encrypted in memory
- **Secure Transmission**: HTTPS for all API calls
- **Input Validation**: Validate all inputs before processing

### Data Sanitization
- **Workflow Sanitization**: Remove credentials before storage
- **Error Messages**: Sanitize error messages to avoid information leakage
- **Logging**: No sensitive data in logs

## 🧪 Testing

### Test Structure
```
packages/core/tests/
├── unit/
│   ├── state-manager.test.ts
│   └── workflow-sanitizer.test.ts
└── integration/
    └── sync-scenarios.test.ts
```

### Test Coverage
- **Unit Tests**: Individual service testing
- **Integration Tests**: Service interaction testing
- **Mocking**: Nock for HTTP, mock-fs for file system
- **Snapshot Tests**: State persistence testing

### Running Tests
```bash
cd packages/core
npm test
```

## 📈 Performance

### Optimization Strategies
- **Batch Operations**: Process multiple workflows in batches
- **Caching**: Cache API responses and file reads
- **Incremental Sync**: Only sync changed workflows
- **Parallel Processing**: Concurrent operations where safe

### Memory Management
- **Stream Processing**: Process large workflows as streams
- **Cleanup**: Proper disposal of resources
- **Monitoring**: Track memory usage and leaks

## 🔧 Configuration

### Configuration Interface
```typescript
interface CoreConfig {
  host: string;
  apiKey: string;
  syncFolder: string;
  syncMode: 'auto' | 'manual';
  pollInterval: number;
  maxRetries: number;
  timeout: number;
  ignorePatterns: string[];
}
```

### Configuration Sources
1. **File**: `n8n-as-code.json`
2. **Environment Variables**: `N8N_HOST`, `N8N_API_KEY`, etc.
3. **Command Line**: CLI arguments
4. **Defaults**: Built-in default values

## 🚀 Development

### Building
```bash
cd packages/core
npm run build
```

### Development Mode
```bash
cd packages/core
npm run dev
```

### TypeScript Configuration
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  }
}
```

## 📚 Related Documentation

- [Architecture Overview](/docs/contribution/architecture): Overall system architecture
- [Agent CLI](/docs/contribution/agent-cli): AI integration details
- [Contribution Guide](/docs/contribution): How to contribute

---

*The Core package provides the foundation for all n8n-as-code functionality, ensuring consistent behavior across different interfaces while maintaining security and performance.*