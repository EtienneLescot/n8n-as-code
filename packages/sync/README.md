# <img src="https://raw.githubusercontent.com/EtienneLescot/n8n-as-code/main/res/logo.png" alt="n8n-as-code logo" width="32" height="32"> @n8n-as-code/sync

> **⚠️ BREAKING CHANGE (v0.13.0)**: This package now handles workflows as **TypeScript files** (`.workflow.ts`) instead of JSON, using the `@n8n-as-code/transformer` package for bidirectional conversion.

The logical sync of the **n8n-as-code** ecosystem.

## 🛠 Purpose

This package contains the shared logic used by the CLI, the Skills CLI, and the VS Code extension:
- **API Client**: Communication with the n8n REST API.
- **Synchronization**: Logic for pulling, pushing, and detecting changes.
- **Sanitization**: Cleaning up n8n JSONs for better Git versioning (removing IDs, timestamps, etc.).
- **State Management**: Tracking local vs. remote state to detect conflicts.

## Usage

This is internal tooling primarily intended to be consumed by other `@n8n-as-code` packages.

```bash
npm install @n8n-as-code/sync
```

## 📄 License
MIT
