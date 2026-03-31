import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

const { splitArgv, createN8nAcTool } = await import("../src/tool.js");

function createMockChild(stdoutText = "", stderrText = "", exitCode = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
    kill: ReturnType<typeof vi.fn>;
  };

  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.kill = vi.fn();

  setTimeout(() => {
    if (stdoutText) child.stdout.write(stdoutText);
    if (stderrText) child.stderr.write(stderrText);
    child.emit("close", exitCode);
  }, 0);

  return child;
}

describe("splitArgv", () => {
  it("splits plain arguments", () => {
    expect(splitArgv("search telegram")).toEqual(["search", "telegram"]);
  });

  it("preserves quoted values with spaces", () => {
    expect(splitArgv("examples search \"slack notification\"")).toEqual([
      "examples",
      "search",
      "slack notification",
    ]);
    expect(splitArgv("docs 'Google Sheets'" )).toEqual(["docs", "Google Sheets"]);
  });

  it("handles escaped whitespace outside single quotes", () => {
    expect(splitArgv("node-info google\\ sheets")).toEqual(["node-info", "google sheets"]);
  });

  it("returns null on unterminated quotes", () => {
    expect(splitArgv("examples \"unterminated")).toBeNull();
  });
});

describe("createN8nAcTool", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("routes instance_list to `n8nac instance list --json`", async () => {
    spawnMock.mockReturnValueOnce(createMockChild('[{"id":"prod"}]', "", 0));
    const tool = createN8nAcTool({ workspaceDir: "/tmp/openclaw-workspace" });

    const result = await tool.execute("call-1", { action: "instance_list" });
    const payload = JSON.parse(result.content[0].text);

    expect(spawnMock).toHaveBeenCalledWith(
      "npx",
      ["--yes", "n8nac", "instance", "list", "--json"],
      expect.objectContaining({ cwd: "/tmp/openclaw-workspace", stdio: "pipe" }),
    );
    expect(payload.output).toContain('"id":"prod"');
  });

  it("routes instance_select by name to the non-interactive CLI command", async () => {
    spawnMock.mockReturnValueOnce(createMockChild("selected", "", 0));
    const tool = createN8nAcTool({ workspaceDir: "/tmp/openclaw-workspace" });

    await tool.execute("call-2", {
      action: "instance_select",
      instanceName: "Production",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "npx",
      ["--yes", "n8nac", "instance", "select", "--instance-name", "Production"],
      expect.objectContaining({ cwd: "/tmp/openclaw-workspace", stdio: "pipe" }),
    );
  });

  it("routes instance_delete by id to the non-interactive CLI command", async () => {
    spawnMock.mockReturnValueOnce(createMockChild("deleted", "", 0));
    const tool = createN8nAcTool({ workspaceDir: "/tmp/openclaw-workspace" });

    await tool.execute("call-3", {
      action: "instance_delete",
      instanceId: "prod",
    });

    expect(spawnMock).toHaveBeenCalledWith(
      "npx",
      ["--yes", "n8nac", "instance", "delete", "--yes", "--instance-id", "prod"],
      expect.objectContaining({ cwd: "/tmp/openclaw-workspace", stdio: "pipe" }),
    );
  });
});
