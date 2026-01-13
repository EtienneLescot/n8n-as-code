import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * Documentation sidebar configuration for n8n-as-code
 */
const sidebars: SidebarsConfig = {
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
        description: 'Learn how to get started with n8n-as-code in just a few minutes.',
        slug: '/docs/getting-started',
      },
      items: [
        'getting-started/index',
      ],
    },
    {
      type: 'category',
      label: 'Usage',
      link: {
        type: 'generated-index',
        title: 'Usage Guides',
        description: 'Learn how to use n8n-as-code with different tools and workflows.',
        slug: '/docs/usage',
      },
      items: [
        {
          type: 'doc',
          id: 'usage/index',
          label: 'Overview',
        },
        {
          type: 'doc',
          id: 'usage/vscode-extension',
          label: 'VS Code Extension',
        },
        {
          type: 'doc',
          id: 'usage/cli',
          label: 'CLI',
        },
      ],
    },
    {
      type: 'category',
      label: 'Contributors',
      link: {
        type: 'generated-index',
        title: 'Contributor Guide',
        description: 'Learn how to contribute to n8n-as-code development.',
        slug: '/docs/contributors',
      },
      items: [
        'contributors/index',
        {
          type: 'doc',
          id: 'contributors/architecture',
          label: 'Architecture',
        },
        {
          type: 'doc',
          id: 'contributors/agent-cli',
          label: 'Agent CLI (Internal)',
        },
        {
          type: 'doc',
          id: 'contributors/core',
          label: 'Core Package (Internal)',
        },
      ],
    },
    {
      type: 'doc',
      id: 'troubleshooting',
      label: 'Troubleshooting',
    },
  ],
};

export default sidebars;
