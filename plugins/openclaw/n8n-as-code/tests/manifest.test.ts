import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import plugin from "../index.js";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", relativePath), "utf8"));
}

function getPackageBasename(packageName: string): string {
  if (packageName.startsWith("@")) {
    const [, basename] = packageName.split("/");
    if (!basename) {
      throw new Error(`Expected a scoped package name with a basename, received "${packageName}"`);
    }
    return basename;
  }

  return packageName;
}

describe("OpenClaw plugin metadata", () => {
  it("keeps the manifest id aligned with the npm package basename", () => {
    const manifest = readJson("openclaw.plugin.json");
    const packageJson = readJson("package.json");
    const packageName = String(packageJson.name ?? "");

    expect(packageName).toMatch(/\S+/);
    expect(manifest.id).toBe(getPackageBasename(packageName));
  });

  it("declares its bundled skill directory", () => {
    const manifest = readJson("openclaw.plugin.json");

    expect(manifest.skills).toEqual(["skills"]);
  });

  it("does not register a facade-specific agent tool", () => {
    const previousHome = process.env.HOME;
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "n8nac-openclaw-home-"));
    process.env.HOME = tempHome;
    try {
      const api = {
        on: vi.fn(),
        registerTool: vi.fn(),
        registerCli: vi.fn(),
        registerService: vi.fn(),
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
        },
      };

      plugin.register(api as never);

      expect(api.registerTool).not.toHaveBeenCalled();
      expect(api.registerCli).toHaveBeenCalled();
      expect(api.registerService).toHaveBeenCalled();
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
