# Search Setup for n8n-as-code Documentation

This document explains how to set up search functionality for the n8n-as-code documentation.

## 🔍 Search Options

The documentation supports two search options:

1. **Algolia DocSearch** (Recommended): Professional, hosted search with AI-powered results
2. **Local Search**: Built-in Docusaurus search that works without external services

## 🚀 Algolia DocSearch Setup

Algolia DocSearch is a free service for open-source projects. It provides:

- 🔍 Fast, relevant search results
- 🤖 AI-powered search suggestions
- 📊 Analytics and insights
- 🌐 Global CDN for fast delivery

### Step 1: Apply for DocSearch

1. Go to [docsearch.algolia.com/apply](https://docsearch.algolia.com/apply/)
2. Fill out the application form:
   - **Project Name**: n8n-as-code
   - **Project URL**: https://n8n-as-code.dev
   - **Repository URL**: https://github.com/EtienneLescot/n8n-as-code
   - **Contact Email**: Your email address
   - **Project Description**: Documentation for n8n-as-code - Manage n8n workflows as code with version control and AI assistance

3. Submit the application (typically approved within a few days)

### Step 2: Configure Algolia Credentials

Once approved, you'll receive:
- `appId`: Your Algolia application ID
- `apiKey`: Search-only API key
- `indexName`: Your index name (e.g., `n8n-as-code`)

### Step 3: Update Configuration

Update `docusaurus.config.ts` with your Algolia credentials:

```typescript
// In themeConfig section
algolia: {
  appId: 'YOUR_APP_ID', // Replace with your appId
  apiKey: 'YOUR_SEARCH_API_KEY', // Replace with your apiKey
  indexName: 'n8n-as-code', // Replace with your indexName
  contextualSearch: true,
  searchParameters: {},
  searchPagePath: 'search',
},
```

### Step 4: Test the Search

1. Build the documentation: `npm run docs:build`
2. Start the local server: `npm run docs:serve`
3. Test search functionality

## 🔧 Local Search Setup

If you don't want to use Algolia, you can use Docusaurus's local search plugin.

### Step 1: Install Local Search Plugin

```bash
cd docs
npm install @docusaurus/plugin-search-local
```

### Step 2: Update Configuration

Replace the Algolia configuration in `docusaurus.config.ts`:

```typescript
// Remove the algolia configuration and add:
plugins: [
  // ... other plugins
  [
    '@docusaurus/plugin-search-local',
    {
      indexDocs: true,
      indexBlog: false,
      indexPages: true,
      language: 'en',
      style: 'minimal',
      maxSearchResults: 10,
      lunr: {
        tokenizerSeparator: /[\s\-]+/,
        // You can add custom lunr options here
      },
    },
  ],
],
```

### Step 3: Remove Algolia Configuration

Remove or comment out the `algolia` section in `themeConfig`.

## 📊 Search Customization

### Custom Search Parameters

You can customize search behavior:

```typescript
algolia: {
  // ... credentials
  searchParameters: {
    facetFilters: ['type:docs'], // Filter by content type
    hitsPerPage: 10, // Number of results per page
    typoTolerance: true, // Enable typo tolerance
  },
  contextualSearch: true, // Enable contextual search
},
```

### Search Page Customization

Create a custom search page at `docs/src/pages/search.tsx`:

```tsx
import React from 'react';
import { DocSearch } from '@docsearch/react';
import '@docsearch/css';

export default function SearchPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Search Documentation</h1>
      <DocSearch
        appId="YOUR_APP_ID"
        apiKey="YOUR_SEARCH_API_KEY"
        indexName="n8n-as-code"
        placeholder="Search documentation..."
      />
    </div>
  );
}
```

## 🧪 Testing Search

### Development Testing

1. Start the development server:
   ```bash
   npm run docs
   ```

2. Open `http://localhost:3000`
3. Click the search icon in the navbar
4. Test various search queries

### Production Testing

1. Build the documentation:
   ```bash
   npm run docs:build
   ```

2. Serve the built files:
   ```bash
   npm run docs:serve
   ```

3. Test search in production mode

## 🔍 Search Best Practices

### Optimizing for Search

1. **Use descriptive titles**: Clear, concise page titles
2. **Add keywords**: Include relevant keywords in frontmatter
3. **Structure content**: Use proper headings (H1, H2, H3)
4. **Add descriptions**: Each page should have a meta description
5. **Use alt text**: For images and diagrams

### Monitoring Search Performance

1. **Algolia Dashboard**: Monitor search analytics
2. **User feedback**: Collect feedback on search results
3. **Search logs**: Analyze what users are searching for
4. **Result relevance**: Regularly test search queries

## 🚨 Troubleshooting

### Common Issues

**Issue**: Search not working
**Solution**:
- Check Algolia credentials
- Verify CORS settings
- Check network connectivity

**Issue**: Poor search results
**Solution**:
- Check page indexing
- Verify content structure
- Update Algolia crawler configuration

**Issue**: Local search not indexing
**Solution**:
- Rebuild the documentation
- Clear browser cache
- Check plugin configuration

## 📚 Additional Resources

- [Algolia DocSearch Documentation](https://docsearch.algolia.com/)
- [Docusaurus Search Documentation](https://docusaurus.io/docs/search)
- [Local Search Plugin](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-search-local)
- [Search Best Practices](https://docusaurus.io/docs/search#best-practices)

## 🤝 Need Help?

- Check the [Algolia Community](https://discourse.algolia.com/)
- Open an [issue on GitHub](https://github.com/EtienneLescot/n8n-as-code/issues)
- Ask in [GitHub Discussions](https://github.com/EtienneLescot/n8n-as-code/discussions)

---

*Last updated: January 2026*