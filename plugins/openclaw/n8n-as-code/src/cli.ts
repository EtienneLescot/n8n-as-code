import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { isWorkspaceInitialized } from "./workspace.js";

type CliProgram = Parameters<Parameters<OpenClawPluginApi["registerCli"]>[0]>[0]["program"];

type CliOpts = {
  program: CliProgram;
  workspaceDir: string;
};

export function registerN8nAcCli({ program, workspaceDir }: CliOpts): void {
  program
    .command("n8nac:status")
    .description("Show n8n-as-code workspace status")
    .action(() => {
      const initialized = isWorkspaceInitialized(workspaceDir);
      console.log(`\nn8n-as-code workspace: ${workspaceDir}`);
      console.log(`Status: ${initialized ? "✓  Initialized" : "✗  Not initialized"}`);
      if (!initialized) {
        console.log("\nUse the n8n-manager and n8n-architect skills to configure runtime access and workflow guidance.");
      }
      console.log();
    });
}
