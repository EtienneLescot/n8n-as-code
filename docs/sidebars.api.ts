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
      label: 'Core Package',
      link: {
        type: 'doc',
        id: 'core/index',
      },
      items: [
        {
          type: 'category',
          label: 'Services',
          items: [
            'core/services/directory-utils',
            'core/services/n8n-api-client',
            'core/services/schema-generator',
            'core/services/state-manager',
            'core/services/sync-manager',
            'core/services/trash-service',
            'core/services/workflow-sanitizer',
          ],
        },
        {
          type: 'category',
          label: 'Types',
          items: [
            'core/types',
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
      label: 'Agent CLI Package',
      link: {
        type: 'doc',
        id: 'agent-cli/index',
      },
      items: [
        {
          type: 'category',
          label: 'Services',
          items: [
            'agent-cli/services/ai-context-generator',
            'agent-cli/services/node-schema-provider',
            'agent-cli/services/snippet-generator',
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