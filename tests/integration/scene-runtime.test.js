import { describe, expect, it } from "vitest";

import { createModuleApi, createRuntime } from "../../scripts/runtime.js";

function makeScene(grid) {
  return {
    grid,
    dimensions: { width: 1000, height: 800 }
  };
}

describe("Scene eligibility runtime boundary", () => {
  it("exposes the wired eligibility service through the diagnostic API", () => {
    const runtime = createRuntime();
    const api = createModuleApi(runtime);

    const squareScene = makeScene({ type: "square", size: 100, distance: 5 });
    const unsupportedScene = makeScene({ type: "gridless", size: 0, distance: 0 });

    expect(api.isSceneEligible(squareScene)).toEqual({ eligible: true, reason: null });
    expect(api.isSceneEligible(unsupportedScene)).toMatchObject({
      eligible: false,
      reason: { code: "GRIDLESS" }
    });
    expect(runtime.getService("sceneEligibility")).toBeDefined();
  });

  it("registers settings during runtime initialization", () => {
    const registrations = [];
    const settings = {
      register(namespace, key, config) {
        registrations.push({ namespace, key, config });
      }
    };
    const runtime = createRuntime({ settings });

    expect(runtime.initialize()).toBe(true);
    expect(registrations.length).toBeGreaterThan(0);
    expect(runtime.initialize()).toBe(false);
  });
});
