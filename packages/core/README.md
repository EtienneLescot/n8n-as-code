# @n8n-as-code/core

The logical core of the **n8n-as-code** ecosystem.

## 🛠 Purpose

This package contains the shared logic used by the CLI, the Agent CLI, and the VS Code extension:
- **API Client**: Communication with the n8n REST API.
- **Synchronization**: Logic for pulling, pushing, and detecting changes.
- **Sanitization**: Cleaning up n8n JSONs for better Git versioning (removing IDs, timestamps, etc.).
- **State Management**: Tracking local vs. remote state to detect conflicts.

## 🚀 Usage

This is internal tooling primarily intended to be consumed by other `@n8n-as-code` packages.

```bash
npm install @n8n-as-code/core
```

## 📄 License
MIT
