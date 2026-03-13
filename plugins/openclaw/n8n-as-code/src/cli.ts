import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import type { Command } from "commander";
import { isWorkspaceInitialized } from "./workspace.js";

type CliOpts = {
  program: Command;
  workspaceDir: string;
};

export function registerN8nAcCli({ program, workspaceDir }: CliOpts): void {
  // -------------------------------------------------------------------------
  // n8nac:status — quick health check
  // -------------------------------------------------------------------------
  program
    .command("n8nac:status")
    .description("Show n8n-as-code workspace status")
    .action(() => {
      const initialized = isWorkspaceInitialized(workspaceDir);
      console.log(`\nn8n-as-code workspace: ${workspaceDir}`);
      console.log(`Status: ${initialized ? "✓  Initialized" : "✗  Not initialized"}`);
      if (!initialized) {
        console.log("\nRun `openclaw n8nac:setup` to connect your n8n instance.");
      }
      console.log();
    });

  // -------------------------------------------------------------------------
  // n8nac:setup — interactive wizard
  // -------------------------------------------------------------------------
  program
    .command("n8nac:setup")
    .description("Initialize or reconfigure the n8n-as-code workspace")
    .option("--host <url>", "n8n host URL (skip prompt)")
    .option("--api-key <key>", "n8n API key (skip prompt)")
    .option("--project-index <n>", "Project index to select (default: 1)", "1")
    .action(async (opts: { host?: string; apiKey?: string; projectIndex: string }) => {
      p.intro("n8n-as-code setup");

      // Ensure workspace dir exists.
      mkdirSync(workspaceDir, { recursive: true });
      p.log.info(`Workspace: ${workspaceDir}`);

      // ------------------------------------------------------------------
      // Step 1: Collect credentials
      // ------------------------------------------------------------------
      let host = opts.host ?? "";
      if (!host) {
        const answer = await p.text({
          message: "n8n host URL",
          placeholder: "https://your-n8n.example.com",
          validate: (v) => (v && v.startsWith("http") ? undefined : "Must start with http:// or https://"),
        });
        if (p.isCancel(answer)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        host = answer as string;
      }

      let apiKey = opts.apiKey ?? "";
      if (!apiKey) {
        const answer = await p.password({
          message: "n8n API key",
          validate: (v) => (v && v.length > 0 ? undefined : "API key cannot be empty"),
        });
        if (p.isCancel(answer)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        apiKey = answer as string;
      }

      // ------------------------------------------------------------------
      // Step 2: init-auth
      // ------------------------------------------------------------------
      const authSpinner = p.spinner();
      authSpinner.start("Saving credentials…");

      const authResult = spawnSync(
        "npx",
        ["--yes", "n8nac", "init-auth", "--host", host, "--api-key", apiKey],
        { cwd: workspaceDir, encoding: "utf-8", timeout: 60_000 },
      );

      if (authResult.status !== 0) {
        authSpinner.stop("Failed to save credentials.");
        p.log.error(authResult.stderr || authResult.stdout || "Unknown error.");
        p.outro("Setup failed. Check your host URL and API key and try again.");
        process.exit(1);
      }
      authSpinner.stop("Credentials saved ✓");

      // ------------------------------------------------------------------
      // Step 3: init-project
      // Spawn with inherited stdio so n8nac's own project picker appears
      // when there are multiple projects.  For a known single project or
      // when the user passed --project-index, run non-interactively.
      // ------------------------------------------------------------------
      const projectIdx = parseInt(opts.projectIndex, 10) || 1;
      const projectSpinner = p.spinner();
      projectSpinner.start("Selecting project…");

      const projectResult = spawnSync(
        "npx",
        [
          "--yes",
          "n8nac",
          "init-project",
          "--project-index",
          String(projectIdx),
          "--sync-folder",
          "workflows",
        ],
        { cwd: workspaceDir, encoding: "utf-8", timeout: 60_000 },
      );

      if (projectResult.status !== 0) {
        projectSpinner.stop("Failed to select project.");
        p.log.error(projectResult.stderr || projectResult.stdout || "Unknown error.");
        p.log.info(
          "If you have multiple projects, rerun with --project-index <n>. " +
            "Check available indexes with: npx n8nac list --remote",
        );
        p.outro("Setup failed.");
        process.exit(1);
      }
      projectSpinner.stop("Project selected ✓");

      // ------------------------------------------------------------------
      // Step 4: update-ai — generate AGENTS.md
      // ------------------------------------------------------------------
      const aiSpinner = p.spinner();
      aiSpinner.start("Generating AI context (AGENTS.md)…");
      spawnSync("npx", ["--yes", "n8nac", "update-ai"], {
        cwd: workspaceDir,
        encoding: "utf-8",
        timeout: 60_000,
      });
      aiSpinner.stop("AI context ready ✓");

      p.outro(
        `Setup complete!\n` +
          `Restart the OpenClaw gateway to activate the n8n-as-code plugin.\n` +
          `Workspace: ${workspaceDir}`,
      );
    });
}
