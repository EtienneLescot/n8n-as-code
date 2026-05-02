import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { TelemetryClient } from "@n8n-as-code/telemetry";
import { isWorkspaceInitialized } from "./workspace.js";

type CliProgram = Parameters<Parameters<OpenClawPluginApi["registerCli"]>[0]>[0]["program"];

type CliOpts = {
  program: CliProgram;
  workspaceDir: string;
  telemetry: TelemetryClient;
};

export function registerN8nAcCli({ program, workspaceDir, telemetry }: CliOpts): void {
  program
    .command("n8nac:status")
    .description("Show n8n-as-code workspace status")
    .action(() => {
      const startedAt = Date.now();
      const initialized = isWorkspaceInitialized(workspaceDir);
      telemetry.track("openclaw_cli_command_completed", {
        command: "n8nac:status",
        outcome: "success",
        duration_ms: Date.now() - startedAt,
        workspace_initialized: initialized,
      });
      telemetry.trackActive({ activation_source_event: "openclaw_cli_command_completed" });
      console.log(`\nn8n-as-code workspace: ${workspaceDir}`);
      console.log(`Status: ${initialized ? "✓  Initialized" : "✗  Not initialized"}`);
      if (!initialized) {
        console.log("\nUse the n8n-manager and n8n-architect skills to configure runtime access and workflow guidance.");
      }
      console.log();
    });
}
