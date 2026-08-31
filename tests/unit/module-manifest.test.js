import { readFileSync } from "node:fs";
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
});
