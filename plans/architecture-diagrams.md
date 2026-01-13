# Architecture Diagrams and Visual Documentation

## Overview
Visual documentation plan for n8n-as-code monorepo using Mermaid.js diagrams embedded in Docusaurus documentation.

## 1. System Architecture Diagrams

### 1.1 High-Level System Overview
```mermaid
graph TB
    subgraph "n8n-as-code Ecosystem"
        VSCode[VS Code Extension]
        CLI[CLI Tool]
        Agent[Agent CLI]
        Core[Core Library]
        
        VSCode --> Core
        CLI --> Core
        Agent --> Core
    end
    
    subgraph "External Systems"
        n8n[n8n Instance]
        Git[Git Repository]
        AI[AI Agents]
    end
    
    Core --> n8n
    Core --> Git
    Agent --> AI
    
    style Core fill:#e1f5fe
    style VSCode fill:#f3e5f5
    style CLI fill:#e8f5e8
    style Agent fill:#fff3e0
```

### 1.2 Monorepo Package Relationships
```mermaid
graph LR
    subgraph "Monorepo Packages"
        Core[@n8n-as-code/core]
        CLI[@n8n-as-code/cli]
        AgentCLI[@n8n-as-code/agent-cli]
        VSCodeExt[VS Code Extension]
    end
    
    CLI --> Core
    AgentCLI --> Core
    VSCodeExt --> Core
    VSCodeExt --> AgentCLI
    
    style Core fill:#bbdefb
```

## 2. Data Flow Diagrams

### 2.1 Workflow Synchronization Flow
```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI/Extension
    participant Core as Core Library
    participant n8n as n8n API
    participant FS as File System
    
    User->>CLI: Init command
    CLI->>Core: Configure connection
    Core->>n8n: Validate API key
    n8n-->>Core: Authentication success
    
    User->>CLI: Pull workflows
    CLI->>Core: Fetch workflows
    Core->>n8n: GET /workflows
    n8n-->>Core: Workflow list
    Core->>Core: Sanitize workflows
    Core->>FS: Save as JSON files
    FS-->>User: Files created
    
    User->>FS: Edit workflow file
    FS->>CLI: File change detected
    CLI->>Core: Push changes
    Core->>n8n: POST/PUT workflow
    n8n-->>Core: Update confirmation
    Core-->>User: Sync complete
```

### 2.2 Conflict Resolution Process
```mermaid
flowchart TD
    A[File Change Detected] --> B{Check Remote State}
    B -->|Unchanged| C[Push Changes]
    B -->|Changed| D[Conflict Detected]
    
    D --> E[Compare Versions]
    E --> F{Automatic Merge Possible?}
    
    F -->|Yes| G[Merge Automatically]
    F -->|No| H[Manual Resolution]
    
    G --> I[Push Merged Version]
    H --> J[Show Diff View]
    J --> K[User Resolves]
    K --> I
    
    I --> L[Update Both Sides]
    C --> L
    
    L --> M[Sync Complete]
```

## 3. Component Diagrams

### 3.1 Core Library Components
```mermaid
graph TD
    subgraph "Core Library"
        API[N8nApiClient]
        Sync[SyncManager]
        State[StateManager]
        Sanitizer[WorkflowSanitizer]
        Schema[SchemaGenerator]
        
        API --> Sync
        State --> Sync
        Sanitizer --> Sync
        Schema --> API
    end
    
    subgraph "External"
        n8nAPI[n8n REST API]
        FileSys[File System]
    end
    
    API --> n8nAPI
    Sync --> FileSys
```

### 3.2 VS Code Extension Architecture
```mermaid
graph TB
    subgraph "VS Code Extension"
        Extension[Extension Entry Point]
        TreeProvider[Workflow Tree Provider]
        Webview[Workflow Webview]
        Proxy[Proxy Service]
        StatusBar[Status Bar]
        
        Extension --> TreeProvider
        Extension --> Webview
        Extension --> Proxy
        Extension --> StatusBar
    end
    
    subgraph "Dependencies"
        Core[Core Library]
        Agent[Agent CLI]
    end
    
    TreeProvider --> Core
    Webview --> Core
    Proxy --> Core
    StatusBar --> Core
    TreeProvider --> Agent
```

## 4. Deployment Architecture

### 4.1 Documentation Deployment Pipeline
```mermaid
flowchart LR
    subgraph "Development"
        Code[Code Changes]
        Docs[Documentation Updates]
        API[API Comments]
    end
    
    subgraph "CI/CD Pipeline"
        Build[Build Documentation]
        Test[Test Build]
        Deploy[Deploy to Hosting]
    end
    
    subgraph "Hosting"
        CDN[CDN]
        Host[Static Host]
        Search[Search Index]
    end
    
    Code --> Build
    Docs --> Build
    API --> Build
    
    Build --> Test
    Test --> Deploy
    
    Deploy --> CDN
    Deploy --> Host
    Deploy --> Search
```

## 5. User Journey Maps

### 5.1 First-Time User Journey
```mermaid
journey
    title First-Time User Experience
    section Installation
      Install CLI: 5: User
      Configure n8n: 4: User
      Pull workflows: 3: User
    section Usage
      Edit workflow: 5: User
      Auto-sync: 4: System
      Verify changes: 3: User
    section Advanced
      AI integration: 4: User
      Custom scripts: 2: Developer
```

## 6. Diagram Implementation Strategy

### 6.1 Mermaid.js Integration
- Use Docusaurus Mermaid plugin
- Embed diagrams in Markdown files
- Ensure proper rendering in dark/light themes

### 6.2 Diagram Locations
1. **Home Page**: System overview diagram
2. **Getting Started**: User journey map
3. **Architecture**: Component and data flow diagrams
4. **Contributor Guide**: Monorepo structure diagram
5. **API Reference**: Package relationship diagram

### 6.3 Maintenance Plan
- Keep diagrams updated with code changes
- Version diagrams alongside features
- Include diagram updates in PR checklist

## 7. Interactive Diagrams (Future Enhancement)

### 7.1 Potential Interactive Elements
- Clickable architecture diagrams
- Animated data flow demonstrations
- Interactive API explorer
- Live configuration examples

### 7.2 Implementation Technologies
- React components for interactivity
- D3.js for advanced visualizations
- Custom Docusaurus components
- Integration with TypeDoc output

## 8. Visual Design Guidelines

### 8.1 Color Scheme
- **Core Library**: Light blue (#bbdefb)
- **CLI**: Light green (#e8f5e8)
- **Agent CLI**: Light orange (#fff3e0)
- **VS Code Extension**: Light purple (#f3e5f5)
- **External Systems**: Light gray (#f5f5f5)

### 8.2 Diagram Standards
- Consistent node shapes
- Clear labeling
- Appropriate abstraction levels
- Mobile-responsive sizing
- Accessible color contrasts

## 9. Quality Assurance

### 9.1 Validation Checklist
- [ ] All diagrams render correctly
- [ ] Colors are accessible
- [ ] Labels are accurate
- [ ] Flow is logically correct
- [ ] Diagrams match current architecture
- [ ] Mobile responsiveness tested

### 9.2 Update Process
1. Review diagrams during architecture changes
2. Update diagrams before releases
3. Validate with code reviewers
4. Test rendering in documentation build