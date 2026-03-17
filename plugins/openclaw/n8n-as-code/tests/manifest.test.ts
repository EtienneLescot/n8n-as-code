import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "..", relativePath), "utf8"));
}

function getPackageBasename(packageName: string): string {
  if (packageName.startsWith("@")) {
    return packageName.split("/")[1] ?? "";
  }

  return packageName;
}

describe("OpenClaw plugin metadata", () => {
  it("keeps the manifest id aligned with the npm package basename", () => {
    const manifest = readJson("openclaw.plugin.json");
    const packageJson = readJson("package.json");
    const packageName = String(packageJson.name ?? "");

    expect(manifest.id).toBe(getPackageBasename(packageName));
  });
});
