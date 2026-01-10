import fs from 'fs';
import { N8nApiClient } from './n8n-api-client.js';

export class AiContextGenerator {
  constructor(private client: N8nApiClient) { }

  async generate(projectRoot: string): Promise<void> {
    // 1. Generate AGENTS.md
    const agentsPath = `${projectRoot}/AGENTS.md`;

    // Fetch real version
    let version = "Unknown";
    try {
      const health = await this.client.getHealth();
      version = health.version;
    } catch { }

    const content = [
      `# 🤖 AGENTS.md - Context for AI Agents`,
      `> **CRITICAL**: Read this file before creating or modifying any n8n workflow files.`,
      ``,
      `## 🎭 Role & Objective`,
      `You are an **Expert n8n Automation Engineer**. Your goal is to manage n8n workflows as **clean, version-controlled code** (JSON) while maintaining full compatibility with the n8n Visual Editor.`,
      ``,
      `## 🌍 Instance Context`,
      `- **n8n Version**: ${version}`,
      `- **Environment**: Production/Dev (Inferred)`,
      ``,
      `## 🛠 Coding Standards & Syntax Rules`,
      `1. **JSON Structure**:`,
      `   - Workflows are stored as standard .json files.`,
      `   - Use the \`n8n-schema.json\` (if present) to validate structure.`,
      `   - **Order Matters**: Keep \`nodes\` and \`connections\` objects sorted.`,
      ``,
      `2. **Expressions**:`,
      `   - Use standard n8n expression syntax: \`{{ $` + `json.myField }}\` or \`{{ $` + `node["Node Name"].json.field }}\`.`,
      `   - **Do not** use Python or generic JS unless inside a Function/Code node.`,
      ``,
      `3. **Node Configuration**:`,
      `   - **Function Nodes**: Prefer the new \`Code\` node type over legacy \`Function\`.`,
      `   - **Triggers**: Ensure only ONE trigger is active if multiple exist.`,
      ``,
      `4. **Git Workflow**:`,
      `   - **Never** commit credentials. Use n8n Credentials store.`,
      ``,
      `## 🔬 Research Protocol (Mandatory)`,
      `> **STOP & READ**: You must NOT hallucinate node parameters. n8n nodes change frequently.`,
      `> Before generating JSON for a specific node (e.g., "Google Sheets", "HTTP Request"), you MUST execute the following **Live Documentation Lookup** sequence:`,
      ``,
      `### Step 1: Fetch the Documentation Index`,
      `Execute the following command to get the latest list of nodes and their documentation URLs:`,
      `\`\`\`bash`,
      `curl -s https://docs.n8n.io/llms.txt`,
      `\`\`\``,
      ``,
      `### Step 2: Extract & Fetch Node Details (Recursive)`,
      `1. Parse the output from Step 1 to find the specific URL(s) corresponding to the node(s) you need.`,
      `2. **For EACH node**, execute curl on its specific URL to retrieve the parameter schema.`,
      `   - *Example*: If you need the HTTP Request node, find its URL in the list and run:`,
      `   \`\`\`bash`,
      `   curl -s [SPECIFIC_NODE_URL_FOUND_IN_STEP_1]`,
      `   \`\`\``,
      ``,
      `### Step 3: Apply Knowledge`,
      `Use the content retrieved in Step 2 as the **source of truth** for:`,
      `- Parameter names (camelCase vs snake_case)`,
      `- Required fields`,
      `- Data structure inputs`,
      ``,
      `## 🧠 Common Patterns`,
      `- **Error Handling**: Use "Error Trigger" workflow or "Continue On Fail" settings.`,
      `- **Looping**: Use "Split In Batches" node.`,
      ``,
      `## 🚫 Prohibited`,
      `- Do not manually edit ID hash strings unless resolving a merge conflict.`,
      `- Do not remove \`parameters\` object from nodes even if empty.`
    ].join('\n');

    fs.writeFileSync(agentsPath, content);

    // 2. Generate .cursorrules
    const cursorRules = `
# .cursorrules
# Defines rules for Cursor AI Agent

# 1. ALWAYS read AGENTS.md for context on n8n specific syntax.
# 2. When asking to generate a workflow, output Valid JSON compatible with n8n import.
# 3. Refer to n8n-schema.json for validation.
`;
    fs.writeFileSync(`${projectRoot}/.cursorrules`, cursorRules.trim());

    // 3. Generate .clinerules
    const clineRules = `
# .clinerules
# Rules for Cline/Roo agents

MEMORY_BANK:
  - READ "AGENTS.md" to understand n8n-as-code principles.
  - VALIDATE generated JSON against "n8n-schema.json".

BEHAVIOR:
  - Prioritize "Code Node" (JS) over deprecated nodes.
  - Maintain clean JSON formatting (2 spaces indentation).
`;
    fs.writeFileSync(`${projectRoot}/.clinerules`, clineRules.trim());
  }
}
