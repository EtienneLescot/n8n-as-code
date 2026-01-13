# Search Functionality and Navigation Implementation

## Overview
Plan for implementing comprehensive search functionality and intuitive navigation for the n8n-as-code documentation site.

## 1. Search Strategy

### 1.1 Search Options Evaluation

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Algolia DocSearch** | Free for OSS, excellent results, fast | Requires approval, limited customization | **Primary Choice** |
| **Local Search** | No external dependencies, full control | Slower for large sites, more implementation work | Fallback option |
| **Pagefind** | Static search, good performance | Less mature, fewer features | Alternative |
| **Typesense** | Self-hosted, feature-rich | Requires hosting, more maintenance | Advanced option |

### 1.2 Algolia DocSearch Implementation

#### Application Process
1. Apply at [docsearch.algolia.com/apply](https://docsearch.algolia.com/apply)
2. Provide site URL: `https://n8n-as-code.dev`
3. Provide repository URL: `https://github.com/EtienneLescot/n8n-as-code`
4. Wait for approval (typically 1-2 weeks)

#### Configuration (`docs/docusaurus.config.js`)
```javascript
themeConfig: {
  algolia: {
    appId: 'YOUR_APP_ID',
    apiKey: 'YOUR_SEARCH_API_KEY',
    indexName: 'n8n-as-code',
    contextualSearch: true,
    searchParameters: {
      facetFilters: ['type:content', 'language:en'],
    },
    searchPagePath: 'search',
  },
},
```

#### Custom Styling (`docs/src/css/search.css`)
```css
/* Algolia search customization */
.DocSearch-Button {
  border: 1px solid var(--ifm-color-emphasis-300);
  background: var(--ifm-color-emphasis-100);
}

.DocSearch-Button:hover {
  border-color: var(--ifm-color-primary);
  background: var(--ifm-color-emphasis-200);
}

.DocSearch-Modal {
  background: var(--ifm-background-color);
  border: 1px solid var(--ifm-color-emphasis-300);
}

[data-theme='dark'] .DocSearch-Modal {
  background: var(--ifm-background-color);
  border-color: var(--ifm-color-emphasis-400);
}
```

### 1.3 Local Search Fallback

If Algolia is not approved, implement local search:

```javascript
// docs/docusaurus.config.js
plugins: [
  [
    require.resolve('@easyops-cn/docusaurus-search-local'),
    {
      indexDocs: true,
      indexBlog: false,
      indexPages: true,
      language: ['en'],
      style: undefined,
      hashed: true,
      docsRouteBasePath: '/docs',
      searchBarPosition: 'right',
    },
  ],
],
```

## 2. Navigation Enhancement

### 2.1 Breadcrumb Navigation
Enable in `docusaurus.config.js`:
```javascript
themeConfig: {
  docs: {
    sidebar: {
      hideable: true,
      autoCollapseCategories: true,
    },
  },
  breadcrumbs: true,
},
```

### 2.2 Custom Navigation Components

#### 2.2.1 Quick Links Component (`docs/src/components/QuickLinks.jsx`)
```jsx
import React from 'react';
import Link from '@docusaurus/Link';

const QuickLinks = () => {
  const links = [
    {
      title: 'Getting Started',
      description: 'Install and configure n8n-as-code',
      href: '/docs/getting-started',
      icon: '🚀',
    },
    {
      title: 'VS Code Extension',
      description: 'Visual workflow management',
      href: '/docs/usage/vscode-extension',
      icon: '💻',
    },
    {
      title: 'CLI Reference',
      description: 'Command-line interface guide',
      href: '/docs/usage/cli/commands',
      icon: '⌨️',
    },
    {
      title: 'API Documentation',
      description: 'Complete API reference',
      href: '/api',
      icon: '📚',
    },
    {
      title: 'Contributing',
      description: 'How to contribute to development',
      href: '/docs/contributors',
      icon: '🤝',
    },
    {
      title: 'Troubleshooting',
      description: 'Common issues and solutions',
      href: '/docs/community/troubleshooting',
      icon: '🔧',
    },
  ];

  return (
    <div className="quick-links">
      <h2>Quick Links</h2>
      <div className="quick-links-grid">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="quick-link-card"
          >
            <div className="quick-link-icon">{link.icon}</div>
            <div className="quick-link-content">
              <h3>{link.title}</h3>
              <p>{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default QuickLinks;
```

#### 2.2.2 Table of Contents Component (`docs/src/components/TocNavigation.jsx`)
```jsx
import React from 'react';
import { useDoc } from '@docusaurus/theme-common/internal';

const TocNavigation = () => {
  const { toc } = useDoc();
  
  if (!toc || toc.length === 0) {
    return null;
  }

  return (
    <nav className="toc-navigation">
      <h3>On This Page</h3>
      <ul className="toc-list">
        {toc.map((heading) => (
          <li key={heading.id} className={`toc-item toc-level-${heading.level}`}>
            <a href={`#${heading.id}`}>{heading.value}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TocNavigation;
```

### 2.3 CSS for Navigation Components
```css
/* docs/src/css/navigation.css */

/* Quick Links */
.quick-links {
  margin: 3rem 0;
}

.quick-links h2 {
  margin-bottom: 1.5rem;
  text-align: center;
}

.quick-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.quick-link-card {
  display: flex;
  align-items: flex-start;
  padding: 1.5rem;
  border: 1px solid var(--ifm-color-emphasis-300);
  border-radius: 0.5rem;
  background: var(--ifm-color-emphasis-100);
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

.quick-link-card:hover {
  border-color: var(--ifm-color-primary);
  background: var(--ifm-color-emphasis-200);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  text-decoration: none;
  color: inherit;
}

.quick-link-icon {
  font-size: 2rem;
  margin-right: 1rem;
  flex-shrink: 0;
}

.quick-link-content h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
}

.quick-link-content p {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

/* Table of Contents */
.toc-navigation {
  position: sticky;
  top: 2rem;
  max-height: calc(100vh - 4rem);
  overflow-y: auto;
  padding: 1rem;
  border-left: 3px solid var(--ifm-color-primary);
  background: var(--ifm-color-emphasis-100);
  border-radius: 0.25rem;
}

.toc-navigation h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ifm-color-emphasis-700);
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-item {
  margin: 0.5rem 0;
}

.toc-item a {
  display: block;
  padding: 0.25rem 0;
  color: var(--ifm-color-emphasis-700);
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s ease;
}

.toc-item a:hover {
  color: var(--ifm-color-primary);
}

.toc-level-2 {
  margin-left: 0;
}

.toc-level-3 {
  margin-left: 1rem;
}

.toc-level-4 {
  margin-left: 2rem;
}

/* Breadcrumb improvements */
.breadcrumbs {
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--ifm-color-emphasis-300);
}

.breadcrumbs__item:not(:last-child)::after {
  content: '›';
  margin: 0 0.5rem;
  opacity: 0.5;
}

/* Mobile navigation */
@media (max-width: 996px) {
  .quick-links-grid {
    grid-template-columns: 1fr;
  }
  
  .toc-navigation {
    position: static;
    margin: 2rem 0;
    border-left: none;
    border-top: 3px solid var(--ifm-color-primary);
  }
}
```

## 3. Site Structure Optimization

### 3.1 Sitemap Generation
```javascript
// docs/docusaurus.config.js
plugins: [
  [
    '@docusaurus/plugin-sitemap',
    {
      changefreq: 'weekly',
      priority: 0.5,
      ignorePatterns: ['/tags/**'],
      filename: 'sitemap.xml',
    },
  ],
],
```

### 3.2 SEO Optimization
```javascript
// docs/docusaurus.config.js
themeConfig: {
  metadata: [
    { name: 'keywords', content: 'n8n, workflow, automation, version control, git, vs code, cli' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ],
},
```

### 3.3 Analytics Integration
```javascript
// docs/docusaurus.config.js
plugins: [
  [
    '@docusaurus/plugin-google-analytics',
    {
      trackingID: 'UA-XXXXXXXXX-X',
      anonymizeIP: true,
    },
  ],
  [
    '@docusaurus/plugin-google-gtag',
    {
      trackingID: 'G-XXXXXXXXXX',
      anonymizeIP: true,
    },
  ],
],
```

## 4. Performance Optimization

### 4.1 Lazy Loading
```javascript
// docs/docusaurus.config.js
themeConfig: {
  prism: {
    additionalLanguages: ['bash', 'json', 'typescript'],
  },
},
```

### 4.2 Image Optimization
- Use WebP format for images
- Implement lazy loading for images
- Optimize image sizes
- Use responsive images

### 4.3 Code Splitting
Docusaurus automatically implements code splitting. Ensure:
- Large components are dynamically imported
- Third-party libraries are tree-shaken
- Unused CSS is purged

## 5. Accessibility

### 5.1 ARIA Labels
Ensure all interactive elements have proper ARIA labels:
```jsx
<button aria-label="Search documentation">
  <SearchIcon />
</button>
```

### 5.2 Keyboard Navigation
- Ensure all interactive elements are keyboard accessible
- Implement skip links
- Maintain logical tab order
- Provide visual focus indicators

### 5.3 Screen Reader Support
- Use semantic HTML elements
- Provide alt text for images
- Ensure color contrast meets WCAG standards
- Test with screen readers

## 6. Testing Plan

### 6.1 Search Testing
- [ ] Algolia search returns relevant results
- [ ] Search works on mobile devices
- [ ] Search respects filters and facets
- [ ] Fallback search works if Algolia fails

### 6.2 Navigation Testing
- [ ] All internal links work
- [ ] Breadcrumbs display correctly
- [ ] Table of contents updates with scrolling
- [ ] Mobile navigation works
- [ ] Keyboard navigation works

### 6.3 Performance Testing
- [ ] Page load times under 3 seconds
- [ ] Search results load quickly
- [ ] Images load efficiently
- [ ] No JavaScript errors

### 6.4 Accessibility Testing
- [ ] WCAG 2.1 AA compliance
- [ ] Screen reader compatibility
- [ ] Keyboard navigation
- [ ] Color contrast compliance

## 7. Implementation Timeline

### Phase 1: Basic Search (Week 1)
- Set up Algolia DocSearch
- Configure basic search UI
- Test search functionality

### Phase 2: Enhanced Navigation (Week 2)
- Implement breadcrumbs
- Add table of contents
- Create quick links component
- Optimize mobile navigation

### Phase 3: Performance & SEO (Week 3)
- Implement sitemap
- Add analytics
- Optimize images and assets
- Test performance

### Phase 4: Accessibility & Polish (Week 4)
- Implement accessibility features
- Test with screen readers
- Polish UI/UX
- Final testing and deployment

## 8. Maintenance Plan

### 8.1 Regular Updates
- Monitor search analytics monthly
- Update sitemap with new content
- Test navigation after major updates
- Review accessibility quarterly

### 8.2 Monitoring
- Set up error tracking for search
- Monitor page load times
- Track user engagement with navigation
- Collect feedback on search relevance

### 8.3 Backup Plan
- Maintain local search as fallback
- Regular backups of search configuration
- Documentation for manual reconfiguration
- Contact information for Algolia support