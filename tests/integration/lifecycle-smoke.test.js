import { describe, expect, it, vi } from "vitest";

import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";
import { bootstrapModule } from "../../scripts/main.js";

describe("module lifecycle boundary", () => {
  it("registers and runs the Foundry init lifecycle callback", () => {
    const hooks = createFakeFoundryHooks();
    const logger = { info: vi.fn() };

    expect(bootstrapModule({ hooks, logger })).toBe(true);
    expect(hooks.registrationCount("init")).toBe(1);

    hooks.fire("init");

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("tactical-3d-viewer")
    );
  });
});
