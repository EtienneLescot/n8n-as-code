import fs from 'fs';

export class AiContextGenerator {
  constructor() { }

  async generate(projectRoot: string, n8nVersion: string = "Unknown"): Promise<void> {
    // 1. Generate AGENTS.md
    const agentsPath = `${projectRoot}/AGENTS.md`;


    const content = [
      `# 🤖 AGENTS.md - Context for AI Agents`,
      `> **CRITICAL**: Read this file before creating or modifying any n8n workflow files.`,
      ``,
      `## 🎭 Role & Objective`,
      `You are an **Expert n8n Automation Engineer**. Your goal is to manage n8n workflows as **clean, version-controlled code** (JSON) while maintaining full compatibility with the n8n Visual Editor.`,
      ``,
      `## 🌍 Instance Context`,
      `- **n8n Version**: ${n8nVersion}`,

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
      `### Step 1: Browse Local Node Documentation`,
      `> **DO NOT** read the \`n8n-nodes-index.json\` file directly (it is too large).`,
      `> Instead, use the **Function Calling Tools** provided via the Agent CLI.`,
      ``,
      `#### Tool 1: Search for a Node`,
      `Find the exact node name (camelCase) for your topic.`,
      `\`$ npx @n8n-as-code/agent-cli search "google sheets"\``,
      ``,
      `#### Tool 2: Get Node Schema`,
      `Get the full property documentation for a specific node.`,
      `\`$ npx @n8n-as-code/agent-cli get "googleSheets"\``,
      ``,
      `#### Tool 3: List All Nodes`,
      `Get a compact catalog of all available nodes.`,
      `\`$ npx @n8n-as-code/agent-cli list\``,
      ``,
      `### Step 2: Apply Knowledge`,
      `Use the JSON output from these commands as the **source of truth** for:`,
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
