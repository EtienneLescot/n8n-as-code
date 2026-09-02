import type { PrismTheme } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Code blocks share the palette the landing page uses for its terminal and
 * editor illustrations, so a snippet in the docs reads as the same artifact
 * as a snippet on the home page.
 *
 * The bundled github/dracula pairing was replaced because several of its
 * light-mode tokens sat below 4.5:1 on the code surface — shell parameters
 * and assignment targets were the worst, at 2.58:1.
 */
const codeThemeLight: PrismTheme = {
  plain: { color: '#12131a', backgroundColor: '#f4f2f0' },
  styles: [
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#646d7b', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator', 'entity'], style: { color: '#4d5666' } },
    { types: ['keyword', 'selector', 'tag', 'atrule', 'important', 'builtin'], style: { color: '#1565c0' } },
    { types: ['function', 'class-name', 'function-variable', 'method'], style: { color: '#b12453' } },
    { types: ['string', 'attr-value', 'char', 'regex', 'url'], style: { color: '#106b4a' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: '#8a5200' } },
    { types: ['variable', 'property', 'attr-name', 'parameter', 'assign-left'], style: { color: '#12131a' } },
    { types: ['deleted'], style: { color: '#b12453' } },
    { types: ['inserted'], style: { color: '#106b4a' } },
  ],
};

const codeThemeDark: PrismTheme = {
  plain: { color: '#dcdfe6', backgroundColor: '#0a0c11' },
  styles: [
    { types: ['comment', 'prolog', 'cdata'], style: { color: '#8b93a4', fontStyle: 'italic' } },
    { types: ['punctuation', 'operator', 'entity'], style: { color: '#8b93a4' } },
    { types: ['keyword', 'selector', 'tag', 'atrule', 'important', 'builtin'], style: { color: '#6bb6ff' } },
    { types: ['function', 'class-name', 'function-variable', 'method'], style: { color: '#ff9ec0' } },
    { types: ['string', 'attr-value', 'char', 'regex', 'url'], style: { color: '#e6c07b' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: '#4ec9a0' } },
    { types: ['variable', 'property', 'attr-name', 'parameter', 'assign-left'], style: { color: '#dcdfe6' } },
    { types: ['deleted'], style: { color: '#ff9ec0' } },
    { types: ['inserted'], style: { color: '#4ec9a0' } },
  ],
};

const config: Config = {
  title: 'n8n-as-code',
  tagline: 'Manage n8n workflows as code with version control and AI assistance',
  favicon: 'img/favicon.ico',

  // Set the production url of your site here
  url: 'https://n8nascode.dev',
  // Custom domains are served from the site root on GitHub Pages.
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'EtienneLescot',
  projectName: 'n8n-as-code',
  trailingSlash: true,

  onBrokenLinks: 'warn',

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: (args) => {
        console.warn(`Broken markdown link found: ${args.url} in ${args.sourceFilePath}`);
      },
    },
  },

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/EtienneLescot/n8n-as-code/tree/main/docs/',
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          routeBasePath: '/docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/docs',
      },
    ],
  ],

  plugins: [
    // Temporarily disabled API plugin due to TypeDoc markdown ID issues
    // [
    //   '@docusaurus/plugin-content-docs',
    //   {
    //     id: 'api',
    //     path: 'static/api',
    //     routeBasePath: 'api',
    //     sidebarPath: './sidebars.api.ts',
    //     editUrl: 'https://github.com/EtienneLescot/n8n-as-code/tree/main/',
    //     showLastUpdateAuthor: true,
    //     showLastUpdateTime: true,
    //     breadcrumbs: true,
    //   },
    // ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/og-image.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'n8n-as-code',
      logo: {
        alt: 'n8n-as-code Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          to: '/docs/usage/vscode-extension',
          label: 'VS Code',
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
              label: 'n8n',
              href: 'https://n8n.io',
            },
            {
              label: 'n8n Community',
              href: 'https://community.n8n.io',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} n8n-as-code. Built with Docusaurus.`,
    },
    prism: {
      theme: codeThemeLight,
      darkTheme: codeThemeDark,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    breadcrumbs: true,
    // Algolia search disabled - not configured yet
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'n8n-as-code',
    //   contextualSearch: true,
    // },
    metadata: [
      { name: 'keywords', content: 'n8n, workflow, automation, version control, git, vs code, cli' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  } satisfies Preset.ThemeConfig,
};

export default config;
