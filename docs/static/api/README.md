# API Documentation

This directory contains the generated API documentation for n8n-as-code.

## Generation

The API documentation is generated using TypeDoc. To regenerate:

```bash
npm run docs:api
```

Or manually:

```bash
node scripts/generate-api-docs.js
```

## Structure

- `index.md` - Main API overview page
- `sync/` - Sync package documentation
- `cli/` - CLI package documentation
- `skills/` - Skills CLI package documentation
- `vscode-extension/` - VS Code extension documentation

## Integration with Docusaurus

This documentation is served by Docusaurus at the `/api` route. The sidebar configuration is in `docs/sidebars.api.ts`.

## Notes

- Do not edit files in this directory manually
- All changes should be made to the source code JSDoc comments
- Regenerate after making changes to source code
