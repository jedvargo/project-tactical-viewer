import { describe, expect, it } from "vitest";

import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { OrientationAdapter } from "../../scripts/model/orientation-adapter.js";
import { chebyshevDistance3d } from "../../scripts/model/distance.js";

describe("Prompt 02 runtime integration", () => {
  it("attaches one canonical orientation adapter and distance function", () => {
    const runtime = createRuntime();

    expect(runtime.getService("orientationAdapter")).toBeInstanceOf(
      OrientationAdapter
    );
    expect(runtime.getService("distance")).toBe(chebyshevDistance3d);
    expect(runtime.getService("orientationAdapter").headingToFoundryRotation(0)).toBe(
      180
    );

    const api = createModuleApi(runtime);
    expect(api.getOrientationAdapter()).toBe(runtime.getService("orientationAdapter"));
    expect(api.getDistance(-3, 4, 1)).toBe(4);
  });
});
