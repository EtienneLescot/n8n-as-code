# Documentation Site Structure Plan

## Overview
Professional documentation solution for n8n-as-code monorepo using Docusaurus + TypeDoc.

## Site Architecture

### 1. Docusaurus Configuration
- **Location**: `/docs` directory at project root
- **Theme**: Docusaurus classic theme with custom styling
- **Features**:
  - Dark/light mode toggle
  - Search functionality (Algolia or local search)
  - Versioning support (future)
  - Internationalization (future)

### 2. Navigation Structure

#### Main Navigation Tabs:
1. **Home** - Landing page with overview
2. **Getting Started** - Quick start guides
3. **Usage** - User guides for different tools
4. **API Reference** - Auto-generated TypeDoc documentation
5. **Contributors** - Development and architecture docs
6. **Community** - Support and resources

#### Sidebar Structure:

**Home Section**
- Overview
- Features
- Why n8n-as-code?

**Getting Started**
- Installation
- Configuration
- First Sync
- VS Code Setup

**Usage**
- **VS Code Extension**
  - Installation & Setup
  - Features Overview
  - Workflow Management
  - AI Integration
  - Troubleshooting
  
- **CLI Tool**
  - Command Reference
  - init command
  - pull/push commands
  - watch mode
  - Configuration Files
  
- **Agent CLI** (Informational)
  - Purpose & Use Cases
  - How AI Agents Use It
  - Integration with Development Tools
  
- **Core Library** (For Advanced Users)
  - API Overview
  - Custom Integration
  - Extension Development

**API Reference** (Auto-generated)
- **@n8n-as-code/core**
  - N8nApiClient
  - SyncManager
  - WorkflowSanitizer
  - StateManager
  - Types
  
- **@n8n-as-code/cli**
  - Commands
  - Services
  
- **@n8n-as-code/agent-cli**
  - NodeSchemaProvider
  - AiContextGenerator
  - SnippetGenerator

**Contributors**
- **Monorepo Overview**
  - Architecture Diagram
  - Package Relationships
  - Development Workflow
  
- **Development Setup**
  - Prerequisites
  - Local Development
  - Testing
  - Building
  
- **Architecture**
  - System Design
  - Data Flow
  - Sync Mechanism
  - Conflict Resolution
  
- **Contributing Guide**
  - Code Style
  - Pull Request Process
  - Release Process
  - Version Management

**Community**
- Support Channels
- FAQ
- Troubleshooting Guide
- Roadmap

## 3. TypeDoc Integration Strategy

### Monorepo Configuration
```
/docs/
  ├── docusaurus.config.js
  ├── sidebars.js
  ├── src/
  │   ├── pages/
  │   ├── css/
  │   └── components/
  └── static/
```

### TypeDoc Setup
- Root `typedoc.json` with `entryPointStrategy: "packages"`
- Individual package configurations in each package directory
- Output to `/docs/api` directory
- Cross-references between packages enabled

### Build Process
1. Generate TypeDoc API documentation for all packages
2. Copy generated docs to Docusaurus static directory
3. Integrate API docs into Docusaurus navigation

## 4. Visual Documentation

### Architecture Diagrams
1. **System Overview** - High-level architecture
2. **Sync Flow** - Data synchronization process
3. **Package Relationships** - Monorepo dependencies
4. **VS Code Extension Architecture** - Extension components

### Mermaid Diagrams
Embedded in documentation for:
- Workflow synchronization process
- Conflict resolution flow
- API request/response cycles
- State management flow

## 5. Content Migration Plan

### Existing Documentation to Migrate:
1. Root README.md → Home page
2. AGENTS.md → Contributor guidelines + AI integration
3. Package READMEs → Respective usage sections
4. CLI help text → Command reference

### New Content to Create:
1. Comprehensive tutorials
2. API examples
3. Best practices
4. Troubleshooting guides
5. Architecture deep-dives

## 6. Implementation Phases

### Phase 1: Foundation
- Set up Docusaurus project
- Configure TypeDoc for monorepo
- Create basic structure

### Phase 2: Content Creation
- Migrate existing documentation
- Create user guides
- Generate API documentation

### Phase 3: Enhancement
- Add visual diagrams
- Implement search
- Polish styling
- Add interactive examples

### Phase 4: Deployment
- CI/CD pipeline
- Hosting setup
- Monitoring and analytics

## 7. Technical Stack

- **Documentation Generator**: Docusaurus v3
- **API Documentation**: TypeDoc
- **Diagramming**: Mermaid.js
- **Search**: Algolia DocSearch or local search
- **Hosting**: GitHub Pages / Vercel / Netlify
- **CI/CD**: GitHub Actions

## 8. Success Metrics

- Complete API documentation for all packages
- User-friendly navigation structure
- Visual architecture documentation
- Search functionality
- Mobile-responsive design
- Fast build times
- Easy contribution workflow