import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

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
      type: 'doc',
      id: 'getting-started/index',
      label: 'Getting Started',
    },
    {
      type: 'category',
      label: 'Usage',
      link: {
        type: 'doc',
        id: 'usage/index',
      },
      items: [
        {
          type: 'doc',
          id: 'usage/vscode-extension',
          label: 'VS Code Extension',
        },
        {
          type: 'doc',
          id: 'usage/claude-plugin',
          label: 'Claude Plugin',
        },
        {
          type: 'doc',
          id: 'usage/openclaw',
          label: 'OpenClaw Plugin',
        },
        {
          type: 'doc',
          id: 'usage/cli',
          label: 'CLI',
        },
        {
          type: 'doc',
          id: 'usage/mcp',
          label: 'MCP Server',
        },
        {
          type: 'doc',
          id: 'usage/typescript-workflows',
          label: 'TypeScript Workflows',
        },
        {
          type: 'doc',
          id: 'usage/claude-plugin-privacy',
          label: 'Claude Plugin Privacy',
        },
      ],
    },
    {
      type: 'category',
      label: 'Contribution',
      link: {
        type: 'generated-index',
        title: 'Contribution Guide',
        description: 'Learn how to contribute to n8n-as-code development.',
        slug: '/docs/contribution',
      },
      items: [
        'contribution/index',
        {
          type: 'doc',
          id: 'contribution/architecture',
          label: 'Architecture',
        },
        {
          type: 'doc',
          id: 'contribution/sync',
          label: 'Sync Engine',
        },
        {
          type: 'doc',
          id: 'contribution/cli',
          label: 'CLI Package',
        },
        {
          type: 'doc',
          id: 'contribution/vscode-extension',
          label: 'VS Code Extension',
        },
        {
          type: 'doc',
          id: 'contribution/skills',
          label: 'Skills & AI Tools',
        },
        {
          type: 'doc',
          id: 'contribution/claude-skill',
          label: 'Claude Adapter',
        },
      ],
    },
    {
      type: 'doc',
      id: 'community/index',
      label: 'Community',
    },
    {
      type: 'doc',
      id: 'troubleshooting',
      label: 'Troubleshooting',
    },
  ],
};

export default sidebars;
