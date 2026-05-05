import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

function getTelemetryEnvironment(): string {
  const explicit = process.env.N8NAC_TELEMETRY_ENV?.trim();
  if (explicit) return explicit;

  const refName = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF?.replace(/^refs\/heads\//, '');
  if (refName === 'main') return 'prod';
  if (refName === 'next') return 'next';
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.CI === 'true') return 'ci';
  return 'dev';
}

const config: Config = {
  title: 'n8n-as-code',
  tagline: 'Manage n8n workflows as code with version control and AI assistance',
  favicon: 'img/favicon.ico',
  customFields: {
    posthogKey: process.env.N8NAC_POSTHOG_KEY || process.env.POSTHOG_KEY || '',
    posthogHost: process.env.N8NAC_POSTHOG_HOST || process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
    telemetryEnvironment: getTelemetryEnvironment(),
  },


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

  clientModules: [require.resolve('./src/telemetry/posthog.ts')],

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
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
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
