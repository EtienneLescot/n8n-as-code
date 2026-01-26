import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

/**
 * API Reference sidebar configuration for n8n-as-code
 * This defines the navigation structure for the API documentation
 */
const sidebars: SidebarsConfig = {
  api: [
    {
      type: 'doc',
      id: 'index',
      label: 'API Overview',
    },
    {
      type: 'category',
      label: 'Sync Package',
      link: {
        type: 'doc',
        id: 'sync/index',
      },
      items: [
        {
          type: 'category',
          label: 'Services',
          items: [
            'sync/services/directory-utils',
            'sync/services/n8n-api-client',
            'sync/services/schema-generator',
            'sync/services/state-manager',
            'sync/services/sync-manager',
            'sync/services/trash-service',
            'sync/services/workflow-sanitizer',
          ],
        },
        {
          type: 'category',
          label: 'Types',
          items: [
            'sync/types',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'CLI Package',
      link: {
        type: 'doc',
        id: 'cli/index',
      },
      items: [
        {
          type: 'category',
          label: 'Commands',
          items: [
            'cli/commands/base',
            'cli/commands/init',
            'cli/commands/init-ai',
            'cli/commands/sync',
            'cli/commands/watch',
          ],
        },
        {
          type: 'category',
          label: 'Services',
          items: [
            'cli/services/config-service',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Skills CLI Package',
      link: {
        type: 'doc',
        id: 'skills/index',
      },
      items: [
        {
          type: 'category',
          label: 'Services',
          items: [
            'skills/services/ai-context-generator',
            'skills/services/node-schema-provider',
            'skills/services/snippet-generator',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'VS Code Extension',
      link: {
        type: 'doc',
        id: 'vscode-extension/index',
      },
      items: [
        {
          type: 'category',
          label: 'Services',
          items: [
            'vscode-extension/services/proxy-service',
          ],
        },
        {
          type: 'category',
          label: 'UI Components',
          items: [
            'vscode-extension/ui/status-bar',
            'vscode-extension/ui/workflow-tree-provider',
            'vscode-extension/ui/workflow-webview',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Shared Utilities',
      link: {
        type: 'doc',
        id: 'shared/index',
      },
      items: [
        'shared/types',
        'shared/constants',
        'shared/utils',
      ],
    },
    {
      type: 'doc',
      id: 'migration-guide',
      label: 'Migration Guide',
    },
    {
      type: 'doc',
      id: 'deprecations',
      label: 'Deprecations',
    },
  ],
};

export default sidebars;