import { describe, expect, it, vi } from "vitest";

import {
  bootstrapModule,
  getModuleApi,
  getRuntime
} from "../../scripts/main.js";
import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";
import { USER_LAYOUT_SETTING_KEY } from "../../scripts/persistence/user-layouts.js";

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

  it("initializes and exposes validated user defaults through PersistenceService", () => {
    const rawLayout = {
      schemaVersion: 1,
      defaultPanelCount: 2,
      linkSelection: false,
      scenes: {}
    };
    const settings = {
      get: vi.fn((namespace, key) => {
        expect(namespace).toBe("tactical-3d-viewer");
        expect(key).toBe(USER_LAYOUT_SETTING_KEY);
        return rawLayout;
      }),
      register: vi.fn()
    };
    const runtime = createRuntime({ settings });

    runtime.initialize();

    const persistence = runtime.getService("persistence");
    expect(persistence.initialized).toBe(true);
    expect(persistence.getDefaults()).toEqual({
      panelCount: 2,
      linkSelection: false,
      linkCenter: true,
      linkZoom: true
    });
    expect(settings.get).toHaveBeenCalledTimes(1);
    expect(createModuleApi(runtime).getUserPreferences().schemaVersion).toBe(2);
  });

  it("starts the live synchronization path and exposes its subscriber boundary", () => {
    const hooks = createFakeFoundryHooks();
    const frames = [];
    const scheduler = (callback) => {
      frames.push(callback);
    };
    const runtime = createRuntime({ hooks, synchronizationScheduler: scheduler });
    const api = createModuleApi(runtime);
    const listener = vi.fn();
    api.onInvalidation(listener);

    runtime.initialize();
    expect(api.getSynchronizationCoordinator().isActive).toBe(true);
    expect(hooks.listenerCount("moveToken")).toBe(1);

    hooks.fire("moveToken", { id: "token-1" }, {}, {}, "user-1");
    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("composes one AssetManager into the runtime renderer boundary", () => {
    const assetManager = { loadPreset: vi.fn(), peekPreset: vi.fn() };
    const renderer = { render: vi.fn() };
    const runtime = createRuntime({ assetManager, renderer });

    expect(runtime.getService("assets")).toBe(assetManager);
    expect(createModuleApi(runtime).getAssetManager()).toBe(assetManager);
  });
});
