import { describe, expect, it } from "vitest";

import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { ProjectionEngine } from "../../scripts/projection/projection-engine.js";

describe("Prompt 06 runtime integration", () => {
  it("registers one projection engine and exposes it through the module API", () => {
    const projectionEngine = new ProjectionEngine();
    const runtime = createRuntime({ projectionEngine });
    const api = createModuleApi(runtime);
    const camera = {
      view: "north",
      focus: { x: 0, y: 0, z: 0 },
      scale: 10,
      screenCenter: { x: 0, y: 0 }
    };

    expect(runtime.getService("projectionEngine")).toBe(projectionEngine);
    expect(api.getProjectionEngine()).toBe(projectionEngine);
    expect(api.projectPoint({ x: 2, y: 8, z: -1 }, camera)).toEqual({ x: 20, y: -10 });
    expect(api.inversePoint({ x: 20, y: -10 }, camera, { hiddenCoordinate: 8 })).toEqual({
      x: 2,
      y: 8,
      z: -1
    });
  });
});
