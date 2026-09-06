import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("module.json"));
const packageJson = JSON.parse(read("package.json"));

describe("release candidate artifacts", () => {
  it("declares complete Foundry metadata and localization", () => {
    expect(manifest).toEqual(expect.objectContaining({
      id: "tactical-3d-viewer",
      readme: "README.md",
      languages: [{ lang: "en", name: "English", path: "lang/en.json" }]
    }));
    expect(manifest.authors).toEqual([{ name: "3D Tactical Viewer Contributors" }]);
    expect(manifest.compatibility).toEqual({ minimum: "14", verified: "14", maximum: "14" });
    expect(existsSync(new URL("lang/en.json", root))).toBe(true);
  });

  it("exposes a dependency-free release and verification command", () => {
    expect(packageJson.dependencies ?? {}).toEqual({});
    expect(packageJson.scripts["package:release"]).toBe("node tools/build-release.js");
    expect(packageJson.scripts["verify:release"]).toBe("node tools/verify-release.js");
    expect(packageJson.scripts["test:release"]).toBe("npm run package:release && npm run verify:release");
    expect(existsSync(new URL("tools/build-release.js", root))).toBe(true);
    expect(existsSync(new URL("tools/verify-release.js", root))).toBe(true);
  });

  it("documents installation, operation, limitations, security, and development", () => {
    const readme = read("README.md");
    for (const heading of [
      "Install",
      "Enable a Scene",
      "Tactical tokens",
      "Panels and links",
      "Movement and orientation",
      "Token art",
      "Limitations",
      "Troubleshooting",
      "Privacy and security",
      "Development and tests"
    ]) {
      expect(readme).toContain(`## ${heading}`);
    }
    expect(readme).toContain("square-grid");
    expect(readme).toContain("isometric");
    expect(readme).toContain("npm run test:release");
  });
});
