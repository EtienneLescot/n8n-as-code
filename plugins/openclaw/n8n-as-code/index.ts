import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerN8nAcCli } from "./src/cli.js";
import { createN8nAcTool } from "./src/tool.js";
import { getWorkspaceDir, isWorkspaceInitialized } from "./src/workspace.js";

// ---------------------------------------------------------------------------
// AGENTS.md context injection — populated once on service start
// ---------------------------------------------------------------------------

const BOOTSTRAP_CONTEXT = `\
## n8n-as-code — Bootstrap

The n8n-as-code plugin is installed but the workspace has not been initialized yet.

**Tell the user:**
> "To start building n8n workflows I need your n8n host URL and API key."

Once you have both, call the \`n8nac\` tool with \`action: "init_auth"\`, then
\`action: "init_project"\` to finish setup.
`;

const MISSING_AGENTS_CONTEXT = `\
## n8n-as-code — AI Context Missing

The workspace is initialized, but the generated AI context file (\`AGENTS.md\`) is missing or unreadable.

**Tell the user:**
> "Your n8n-as-code workspace is connected, but the AI context needs to be regenerated before I can safely guide workflow changes."

Ask the user to run \`npx --yes n8nac update-ai\` in the OpenClaw workspace, or rerun
\`openclaw n8nac:setup\` if they want the setup wizard to repair it.
`;

let agentsContext: string | null = null;

function readConfig(workspaceDir: string): Record<string, string> {
  try {
    const raw = readFileSync(join(workspaceDir, "n8nac-config.json"), "utf-8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function buildStatusHeader(workspaceDir: string): string {
  const cfg = readConfig(workspaceDir);
  const host = cfg.host ?? "(unknown)";
  const project = cfg.projectName ?? cfg.projectId ?? "(unknown)";
  return [
    "## ✅ n8n-as-code Workspace Status",
    "",
    "**The workspace is already fully initialized. Do NOT ask the user for credentials.**",
    "",
    `- Workspace directory: \`${workspaceDir}\``,
    `- n8n host: \`${host}\``,
    `- Active project: \`${project}\``,
    "",
    "Skip the 'Workspace Bootstrap' section below — setup is complete.",
    "Proceed directly to the user's request using the `n8nac` tool.",
    "",
    "---",
    "",
  ].join("\n");
}

function loadAgentsContext(workspaceDir: string): string | null {
  const p = join(workspaceDir, "AGENTS.md");
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf-8");
    return buildStatusHeader(workspaceDir) + raw;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const n8nAcPlugin = {
  id: "n8nac",
  name: "n8n-as-code",
  description:
    "Create and manage n8n workflows from OpenClaw using n8n-as-code (n8nac). " +
    "Guides through workspace initialization, workflow CRUD, and AI-powered node schema lookup.",

  register(api: OpenClawPluginApi) {
    const workspaceDir = getWorkspaceDir();

    // Ensure the plugin workspace directory always exists.
    mkdirSync(workspaceDir, { recursive: true });

    // -- Context injection ---------------------------------------------------
    // Prepend n8n-architect instructions to every prompt build.
    api.on("before_prompt_build", () => {
      const initialized = isWorkspaceInitialized(workspaceDir);
      // Lazy-load: setup may have run after the gateway started, so the
      // service start() missed it.  Re-attempt on every prompt until loaded.
      // The status header embeds host + project, so re-read on every call
      // when not yet cached to pick up fresh config after setup.
      if (agentsContext === null && initialized) {
        agentsContext = loadAgentsContext(workspaceDir);
      }
      const context = agentsContext ?? (initialized ? MISSING_AGENTS_CONTEXT : BOOTSTRAP_CONTEXT);
      if (!context) return;
      return { prependContext: context };
    });

    // -- Agent tool ----------------------------------------------------------
    api.registerTool(createN8nAcTool({ workspaceDir }));

    // -- CLI wizard ----------------------------------------------------------
    api.registerCli(
      ({ program }) => registerN8nAcCli({ program, workspaceDir }),
      { commands: ["n8nac:setup", "n8nac:status"] },
    );

    // -- Service -------------------------------------------------------------
    // On gateway start: refresh the AGENTS.md cache so the agent always has
    // up-to-date node knowledge.
    api.registerService({
      id: "n8nac-context",
      start: async () => {
        // Invalidate so next before_prompt_build re-reads from disk.
        agentsContext = null;
        if (isWorkspaceInitialized(workspaceDir)) {
          agentsContext = loadAgentsContext(workspaceDir);
          if (agentsContext) {
            api.logger.info("[n8nac] Workspace ready — AI context loaded.");
          } else {
            api.logger.warn("[n8nac] Workspace ready, but AGENTS.md is missing or unreadable.");
          }
        } else {
          api.logger.info("[n8nac] Workspace not initialized. Run `openclaw n8nac:setup`.");
        }
      },
      stop: async () => {
        agentsContext = null;
      },
    });
  },
};

export default n8nAcPlugin;
