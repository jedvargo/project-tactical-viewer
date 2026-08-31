import { describe, expect, it, vi } from "vitest";

import {
  bootstrapModule,
  getModuleApi,
  getRuntime
} from "../../scripts/main.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";

describe("runtime composition root", () => {
  it("initializes exactly once and exposes diagnostics after init", () => {
    const hooks = createFakeFoundryHooks();
    const logger = { info: vi.fn() };
    const foundryModule = {};
    vi.stubGlobal("game", {
      modules: { get: vi.fn(() => foundryModule) }
    });

    const first = bootstrapModule({ hooks, logger });
    const second = bootstrapModule({ hooks, logger });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(hooks.registrationCount("init")).toBe(1);

    expect(getRuntime()).toBeUndefined();
    hooks.fire("init");

    const runtime = getRuntime();
    expect(runtime).toBeDefined();
    expect(runtime.initialized).toBe(true);
    expect(runtime.initialize()).toBe(false);
    expect(getRuntime()).toBe(runtime);

    const api = getModuleApi();
    expect(api).toBeDefined();
    expect(api.getDiagnostics()).toEqual({
      moduleId: "tactical-3d-viewer",
      schemaVersion: 2,
      views: runtime.viewRegistry.list()
    });
    expect(api.getViewRegistry()).toBe(runtime.viewRegistry);
    expect(foundryModule.api).toBe(api);

    vi.unstubAllGlobals();
  });

  it("keeps the diagnostic API read-only", () => {
    const hooks = createFakeFoundryHooks();
    bootstrapModule({ hooks, logger: { info: vi.fn() } });
    hooks.fire("init");

    const api = getModuleApi();
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.getDiagnostics())).toBe(true);
    expect(api.setRuntime).toBeUndefined();
  });
});
