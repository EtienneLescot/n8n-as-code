# 🚀 n8n-as-code

![Tests](https://github.com/EtienneLescot/n8n-as-code/actions/workflows/tests.yml/badge.svg)
![Version](https://img.shields.io/badge/version-0.1.0-blue)

**n8n-as-code** is an ecosystem designed to manage your n8n workflows as code. It transforms your automations into synchronized local JSON files, enabling version control (Git), AI-assisted editing, and seamless integration into VS Code.

---

## ⚡ Quick Start

Ready to sync your workflows in under 2 minutes?

1.  **Installation**:
    ```bash
    npm install && npm run build
    npm link
    ```

    > **Note**: The first `npm run build` will automatically clone the n8n repository (`.n8n-cache`) to generate the node schema. This may take a few minutes.
    > **Note**: The `npm link` command creates a global link to the CLI, allowing you to use `n8n-as-code` directly from any terminal.
2.  **Configuration**:
    ```bash
    n8n-as-code init
    ```
    > **Note**: The assistant will guide you through configuring your n8n instance and will securely store your API key off-project.
3.  **Initial Sync**: Download your existing workflows:
    ```bash
    n8n-as-code pull
    ```
4.  **Open VS Code**: Install the local extension (`packages/vscode-extension`) and enjoy automatic synchronization and AI assistance.

---

## 🎨 VS Code Extension: The n8n Cockpit

The extension transforms VS Code into a true IDE for n8n.

-   **Activity Bar Icon**: Direct access to all your workflows from the left side panel.
-   **Embedded Board**: Open your workflows in an integrated web view for immediate visual feedback.
-   **Split View**: Edit the JSON on the left while keeping the n8n canvas on the right.
-   **Push on Save**: Any local modification is instantly sent to n8n.
-   **Automatic AI Context**: Upon opening, the extension automatically generates AI assistance (`AGENTS.md`, snippets, schemas).
-   **🛡️ Conflict Management**: Detects if a workflow has been modified simultaneously on n8n and locally, offering a Diff View to resolve conflicts without data loss.

---

## ⚙️ Configuration

The CLI uses an interactive and secure configuration system via the `init` command.

### Configuration Files
- **`n8n-as-code.json`**: Contains project settings (Host, folders, etc.). This file is created at the root and can be shared via Git.
- **Global Storage**: Your API keys are linked to the host and stored locally on your machine, never committed.
- **`n8n-as-code-instance.json`**: Manages your instance's unique identifier to isolate files from different environments.

---

## 🛠 CLI Commands (`@n8n-as-code/cli`)

For those who prefer the terminal or automation. Commands are accessible via `n8n-as-code`.

-   **`init`**: Configures your n8n instance and local project.
-   **`pull`**: Retrieves all workflows from n8n.
-   **`push`**: Sends new local files to n8n.
-   **`watch`**: Real-time bi-directional synchronization mode with interactive conflict resolution.
-   **`init-ai`**: Generates context for your AI agent.

Example usage:
```bash
n8n-as-code init
n8n-as-code pull
n8n-as-code watch
```

---

## 🤖 AI Context & Superpowers

We inject specific context to make your AI (Cursor, Windsurf, Copilot) an expert in n8n:

-   📄 **`AGENTS.md`**: System instructions on n8n structure and best practices.
-   🛡️ **`n8n-schema.json`**: Strict validation of your JSONs to avoid structural errors.
-   🧩 **Snippets**: Library of predefined nodes (Webhook, Code, HTTP...) for faster coding.

---

## 🧪 Tests & Quality

The project includes a suite of unit and integration tests to guarantee synchronization reliability.

### Run Tests
```bash
# Unit and integration tests
npm test
```

*Note: Integration tests require a `.env.test` file at the root with `N8N_HOST` and `N8N_API_KEY`.*

---

## 🛠️ Local Development and Testing

Debug mode (F5) from `packages/vscode-extension`.

Or use the following command at the root to compile, package, and install the extension locally in your main VS Code instance:

```bash
npm run extension:dev
npm run extension:install
```

---

## 🚀 Release & Distribution

This project uses [Changesets](https://github.com/changesets/changesets) for automated versioning and NPM publishing.

### For Developers: Creating a Release

1.  **Document your changes**:
    ```bash
    npm run changeset
    ```
    Follow the prompts to select packages and version types (patch/minor/major) and provide a summary.

2.  **Version and Changelog**:
    Once ready for a release, update versions and changelogs:
    ```bash
    npm run version-packages
    ```

3.  **Publish**:
    Build and publish all packages to NPM:
    ```bash
    npm run release
    ```

---

## 🏗 Architecture (Monorepo)

-   **`packages/core`**: The logical core: API interactions, synchronization logic, and workflow sanitization.
-   **`packages/cli`**: The main command-line interface for manual workflow management.
-   **`packages/agent-cli`**: Specialized tools for AI Agents (Cursor, Cline), providing search and schema retrieval capabilities.
-   **`packages/vscode-extension`**: The VS Code plugin for seamless real-time synchronization and AI assistance.

---

## 🤝 Contribution

Contributions are welcome!

1.  **Fork** the project.
2.  **Clone** your fork locally.
3.  **Create a branch** for your feature (`git checkout -b feature/AmazingFeature`).
4.  **Ensure tests pass** (`npm test`).
5.  **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
6.  **Push** to the branch (`git push origin feature/AmazingFeature`).
7.  **Open a Pull Request**.

---

## 📄 License
MIT
