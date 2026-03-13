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

let agentsContext: string | null = null;

function loadAgentsContext(workspaceDir: string): string | null {
  const p = join(workspaceDir, "AGENTS.md");
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, "utf-8");
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
      if (agentsContext === null && initialized) {
        agentsContext = loadAgentsContext(workspaceDir);
      }
      const context = agentsContext ?? (initialized ? null : BOOTSTRAP_CONTEXT);
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
          api.logger.info("[n8nac] Workspace ready — AI context loaded.");
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
