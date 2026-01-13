# Docusaurus Project Setup and Theming Plan

## Overview
Complete setup guide for Docusaurus documentation site with custom theming, navigation, and integration with TypeDoc.

## 1. Project Structure

```
docs/
├── blog/                    # Blog posts (optional)
├── docs/                    # Documentation content
│   ├── home/               # Home section
│   ├── getting-started/    # Getting started guides
│   ├── usage/              # Usage documentation
│   │   ├── vscode-extension/
│   │   ├── cli/
│   │   ├── agent-cli/
│   │   └── core/
│   ├── contributors/       # Contributor documentation
│   └── community/          # Community resources
├── src/
│   ├── components/         # Custom React components
│   ├── css/               # Custom CSS
│   ├── pages/             # Additional pages
│   └── theme/             # Theme overrides
├── static/                # Static assets
│   ├── img/              # Images
│   ├── api/              # TypeDoc generated API docs
│   └── downloads/        # Downloadable files
├── docusaurus.config.js   # Main configuration
├── sidebars.js           # Navigation sidebar
├── package.json          # Docusaurus dependencies
└── README.md             # Docs project README
```

## 2. Docusaurus Configuration

### 2.1 Main Configuration (`docusaurus.config.js`)
```javascript
// @ts-check
import { themes as prismThemes } from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'n8n-as-code',
  tagline: 'Manage n8n workflows as code with version control and AI assistance',
  favicon: 'img/favicon.ico',

  url: 'https://n8n-as-code.dev',
  baseUrl: '/',
  trailingSlash: false,

  organizationName: 'EtienneLescot',
  projectName: 'n8n-as-code',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/EtienneLescot/n8n-as-code/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/og-image.png',
      navbar: {
        title: 'n8n-as-code',
        logo: {
          alt: 'n8n-as-code Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docs',
            position: 'left',
            label: 'Documentation',
          },
          {
            to: '/api',
            label: 'API Reference',
            position: 'left',
          },
          {
            href: 'https://github.com/EtienneLescot/n8n-as-code',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Documentation',
            items: [
              {
                label: 'Getting Started',
                to: '/docs/getting-started',
              },
              {
                label: 'Usage Guides',
                to: '/docs/usage',
              },
              {
                label: 'API Reference',
                to: '/api',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/EtienneLescot/n8n-as-code',
              },
              {
                label: 'Discussions',
                href: 'https://github.com/EtienneLescot/n8n-as-code/discussions',
              },
              {
                label: 'Issues',
                href: 'https://github.com/EtienneLescot/n8n-as-code/issues',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'n8n',
                href: 'https://n8n.io',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} n8n-as-code. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'json', 'typescript'],
      },
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
      algolia: {
        appId: 'YOUR_APP_ID',
        apiKey: 'YOUR_SEARCH_API_KEY',
        indexName: 'n8n-as-code',
        contextualSearch: true,
      },
    }),

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api',
        path: 'static/api',
        routeBasePath: 'api',
        sidebarPath: require.resolve('./sidebars.api.js'),
      },
    ],
    [
      '@docusaurus/plugin-content-pages',
      {
        path: 'src/pages',
        routeBasePath: '',
        include: ['**/*.{js,jsx,ts,tsx,md,mdx}'],
      },
    ],
    'docusaurus-plugin-image-zoom',
  ],

  themes: ['@docusaurus/theme-mermaid'],
};

export default config;
```

### 2.2 Sidebar Configuration (`sidebars.js`)
```javascript
module.exports = {
  docs: [
    {
      type: 'doc',
      id: 'home/index',
      label: 'Home',
    },
    {
      type: 'category',
      label: 'Getting Started',
      link: {
        type: 'generated-index',
        title: 'Getting Started',
        description: 'Get up and running with n8n-as-code in minutes.',
        slug: '/getting-started',
      },
      items: [
        'getting-started/installation',
        'getting-started/configuration',
        'getting-started/first-sync',
        'getting-started/vscode-setup',
      ],
    },
    {
      type: 'category',
      label: 'Usage',
      link: {
        type: 'generated-index',
        title: 'Usage Guides',
        description: 'Learn how to use n8n-as-code tools effectively.',
        slug: '/usage',
      },
      items: [
        {
          type: 'category',
          label: 'VS Code Extension',
          link: { type: 'doc', id: 'usage/vscode-extension/index' },
          items: [
            'usage/vscode-extension/installation',
            'usage/vscode-extension/features',
            'usage/vscode-extension/workflow-management',
            'usage/vscode-extension/ai-integration',
            'usage/vscode-extension/troubleshooting',
          ],
        },
        {
          type: 'category',
          label: 'CLI Tool',
          link: { type: 'doc', id: 'usage/cli/index' },
          items: [
            'usage/cli/commands',
            'usage/cli/configuration',
            'usage/cli/advanced-usage',
            'usage/cli/troubleshooting',
          ],
        },
        {
          type: 'category',
          label: 'Agent CLI',
          link: { type: 'doc', id: 'usage/agent-cli/index' },
          items: [
            'usage/agent-cli/purpose',
            'usage/agent-cli/ai-integration',
            'usage/agent-cli/development-tools',
          ],
        },
        {
          type: 'category',
          label: 'Core Library',
          link: { type: 'doc', id: 'usage/core/index' },
          items: [
            'usage/core/overview',
            'usage/core/integration',
            'usage/core/advanced',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Contributors',
      link: {
        type: 'generated-index',
        title: 'Contributor Guide',
        description: 'Resources for developers contributing to n8n-as-code.',
        slug: '/contributors',
      },
      items: [
        'contributors/monorepo-overview',
        'contributors/development-setup',
        'contributors/architecture',
        'contributors/contributing-guide',
        'contributors/release-process',
      ],
    },
    {
      type: 'category',
      label: 'Community',
      link: {
        type: 'generated-index',
        title: 'Community Resources',
        description: 'Get help and connect with the n8n-as-code community.',
        slug: '/community',
      },
      items: [
        'community/support',
        'community/faq',
        'community/troubleshooting',
        'community/roadmap',
      ],
    },
  ],
};
```

### 2.3 API Sidebar Configuration (`sidebars.api.js`)
```javascript
module.exports = {
  api: [
    {
      type: 'category',
      label: 'API Reference',
      link: {
        type: 'generated-index',
        title: 'API Reference',
        description: 'Complete API documentation for all n8n-as-code packages.',
        slug: '/api',
      },
      items: [
        {
          type: 'category',
          label: '@n8n-as-code/core',
          link: { type: 'doc', id: 'api/core/index' },
          items: require('./api/core/typedoc-sidebar.cjs'),
        },
        {
          type: 'category',
          label: '@n8n-as-code/cli',
          link: { type: 'doc', id: 'api/cli/index' },
          items: require('./api/cli/typedoc-sidebar.cjs'),
        },
        {
          type: 'category',
          label: '@n8n-as-code/agent-cli',
          link: { type: 'doc', id: 'api/agent-cli/index' },
          items: require('./api/agent-cli/typedoc-sidebar.cjs'),
        },
        {
          type: 'category',
          label: 'VS Code Extension',
          link: { type: 'doc', id: 'api/vscode-extension/index' },
          items: require('./api/vscode-extension/typedoc-sidebar.cjs'),
        },
      ],
    },
  ],
};
```

## 3. Custom Theming

### 3.1 Custom CSS (`src/css/custom.css`)
```css
:root {
  --ifm-color-primary: #2563eb;
  --ifm-color-primary-dark: #1d4ed8;
  --ifm-color-primary-darker: #1e40af;
  --ifm-color-primary-darkest: #1e3a8a;
  --ifm-color-primary-light: #3b82f6;
  --ifm-color-primary-lighter: #60a5fa;
  --ifm-color-primary-lightest: #93c5fd;
  
  --ifm-code-font-size: 95%;
  --ifm-font-family-base: 'Inter', system-ui, -apple-system, sans-serif;
  --ifm-heading-font-family: 'Inter', system-ui, -apple-system, sans-serif;
  
  --docusaurus-highlighted-code-line-bg: rgba(37, 99, 235, 0.1);
}

[data-theme='dark'] {
  --ifm-color-primary: #60a5fa;
  --ifm-color-primary-dark: #3b82f6;
  --ifm-color-primary-darker: #2563eb;
  --ifm-color-primary-darkest: #1d4ed8;
  --ifm-color-primary-light: #93c5fd;
  --ifm-color-primary-lighter: #bfdbfe;
  --ifm-color-primary-lightest: #dbeafe;
  
  --docusaurus-highlighted-code-line-bg: rgba(96, 165, 250, 0.2);
}

/* Custom styling for API documentation */
.api-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  margin-right: 0.5rem;
}

.api-badge-core {
  background-color: #bbdefb;
  color: #0d47a1;
}

.api-badge-cli {
  background-color: #e8f5e8;
  color: #1b5e20;
}

.api-badge-agent {
  background-color: #fff3e0;
  color: #e65100;
}

.api-badge-vscode {
  background-color: #f3e5f5;
  color: #4a148c;
}

/* Mermaid diagram styling */
.mermaid {
  margin: 2rem 0;
  text-align: center;
}

.mermaid svg {
  max-width: 100%;
  height: auto;
}

/* Custom component styling */
.architecture-diagram {
  border: 1px solid var(--ifm-color-emphasis-300);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin: 2rem 0;
  background: var(--ifm-color-emphasis-100);
}

/* Code block enhancements */
.prism-code {
  border-radius: 0.5rem;
  border: 1px solid var(--ifm-color-emphasis-300);
}

/* Navigation improvements */
.navbar {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

[data-theme='dark'] .navbar {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Footer styling */
.footer {
  border-top: 1px solid var(--ifm-color-emphasis-300);
}
```

### 3.2 Custom Components

#### 3.2.1 Package Badge Component (`src/components/PackageBadge.jsx`)
```jsx
import React from 'react';

const PackageBadge = ({ package: pkg }) => {
  const badgeConfig = {
    core: { label: '@n8n-as-code/core', className: 'api-badge-core' },
    cli: { label: '@n8n-as-code/cli', className: 'api-badge-cli' },
    'agent-cli': { label: '@n8n-as-code/agent-cli', className: 'api-badge-agent' },
    'vscode-extension': { label: 'VS Code Extension', className: 'api-badge-vscode' },
  };

  const config = badgeConfig[pkg] || { label: pkg, className: '' };

  return (
    <span className={`api-badge ${config.className}`}>
      {config.label}
    </span>
  );
};

export default PackageBadge;
```

#### 3.2.2 Architecture Diagram Component (`src/components/ArchitectureDiagram.jsx`)
```jsx
import React from 'react';

const ArchitectureDiagram = ({ title, children, type = 'default' }) => {
  return (
    <div className={`architecture-diagram architecture-diagram-${type}`}>
      {title && <h3>{title}</h3>}
      <div className="diagram-content">
        {children}
      </div>
    </div>
  );
};

export default ArchitectureDiagram;
```

## 4. Installation and Setup Scripts

### 4.1 Setup Script (`scripts/setup-docs.js`)
```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Setting up Docusaurus documentation site...');

// Create docs directory if it doesn't exist
const docsDir = path.join(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Initialize Docusaurus project
console.log('Initializing Docusaurus project...');
execSync('npx create-docusaurus@latest docs classic --typescript', { 
  stdio: 'inherit',
  cwd: process.cwd()
});

console.log('Docusaurus project created successfully!');

// Install additional dependencies
console.log('Installing additional dependencies...');
const dependencies = [
  '@docusaurus/theme-mermaid',
  'docusaurus-plugin-image-zoom',
  'prism-react-renderer',
];

execSync(`cd docs && npm install ${dependencies.join(' ')}`, { stdio: 'inherit' });

console.log('Documentation setup complete!');
console.log('\nNext steps:');
console.log('1. cd docs');
console.log('2. npm run start');
console.log('3. Customize configuration in docusaurus.config.js');
```

### 4.2 Package.json Updates for Root Project
```json
{
  "scripts": {
    "docs:setup": "node scripts/setup-docs.js",
    "docs:dev": "cd docs && npm run start",
    "docs:build": "cd docs && npm run build",
    "docs:serve": "cd docs && npm run serve",
    "docs:deploy": "cd docs && npm run deploy"
  }
}
```

## 5. Development Workflow

### 5.1 Local Development
```bash
# Start documentation site locally
npm run docs:dev

# Build for production
npm run docs:build

# Serve built site
npm run docs:serve
```

### 5.2 Content