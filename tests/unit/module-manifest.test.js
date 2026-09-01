import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifestUrl = new URL("../../module.json", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));

describe("Foundry module manifest", () => {
  it("declares the tactical-3d-viewer v14 module and its real entrypoint", () => {
    expect(manifest.id).toBe("tactical-3d-viewer");
    expect(manifest.esmodules).toContain("scripts/main.js");
    expect(manifest.compatibility).toEqual(expect.objectContaining({
      minimum: "14",
      verified: "14"
    }));
    expect(manifest.compatibility.maximum).toBeDefined();
  });

  it("points to an entrypoint that exists in the repository", () => {
    const entrypointUrl = new URL(`../../${manifest.esmodules[0]}`, import.meta.url);
    expect(() => readFileSync(entrypointUrl, "utf8")).not.toThrow();
  });

  it("configures Foundry v14 hot reload for runtime assets only", () => {
    expect(manifest.flags?.hotReload).toEqual({
      extensions: ["js", "mjs", "css", "html", "hbs", "json"],
      paths: ["scripts", "styles", "lang"]
    });

    for (const path of manifest.flags.hotReload.paths) {
      expect(existsSync(new URL(`../../${path}/`, import.meta.url))).toBe(true);
    }

    expect(manifest.flags.hotReload.paths).not.toEqual(
      expect.arrayContaining(["tests", "node_modules", "dist", ".git", "docs"])
    );
  });

  it("preserves the module's compatibility and asset metadata", () => {
    expect(manifest.compatibility).toEqual({ minimum: "14", verified: "14", maximum: "14" });
    expect(manifest.esmodules).toEqual(["scripts/main.js"]);
    expect(manifest.styles).toEqual(["styles/tactical-viewer.css"]);
    expect(manifest.languages).toEqual([
      { lang: "en", name: "English", path: "lang/en.json" }
    ]);
  });
});
