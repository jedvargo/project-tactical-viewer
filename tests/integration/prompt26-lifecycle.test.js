import { describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../scripts/constants.js";
import { createRuntime } from "../../scripts/runtime.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";
import { createFakeSquareGrid } from "../helpers/fake-grid.js";

function frameScheduler() {
  const callbacks = [];
  const scheduler = (callback) => {
    callbacks.push(callback);
    return callback;
  };
  scheduler.flush = () => callbacks.splice(0).forEach((callback) => callback());
  return scheduler;
}

function makeScene(id, enabled = true) {
  return {
    id,
    grid: { type: "square", size: 100, distance: 5 },
    dimensions: { width: 1000, height: 1000 },
    flags: { [MODULE_ID]: { enabled } },
    tokens: []
  };
}

class FakeViewer {
  static instances = [];

  constructor(options) {
    this.scene = options.scene;
    this.options = options;
    this.rendered = false;
    this.close = vi.fn(async () => {
      this.rendered = false;
      this.options.onClosed?.(this, { source: "application" });
    });
    FakeViewer.instances.push(this);
  }

  async render() {
    this.rendered = true;
    return this;
  }
}

describe("Prompt 26 runtime lifecycle", () => {
  it("cycles Scenes, saves through close, and re-evaluates entry eligibility", async () => {
    FakeViewer.instances = [];
    const hooks = createFakeFoundryHooks();
    const scheduler = frameScheduler();
    const saveSceneLayout = vi.fn(async () => {});
    const settings = {
      register: vi.fn(),
      get: vi.fn((namespace, key) => key === "userLayout" ? {} : true),
      set: vi.fn(async () => {})
    };
    const runtime = createRuntime({
      hooks,
      settings,
      synchronizationScheduler: scheduler,
      viewerApplicationClass: FakeViewer,
      persistenceService: {
        initialize: vi.fn(),
        getSceneLayout: vi.fn(() => ({ panelCount: 1, panels: [{ view: "top" }] })),
        saveSceneLayout
      }
    });
    runtime.initialize();

    const sceneA = makeScene("scene-a");
    const sceneB = makeScene("scene-b");
    const unsupported = {
      ...makeScene("unsupported"),
      grid: { type: "hex", size: 100, distance: 5 }
    };

    hooks.fire("canvasReady", { scene: sceneA });
    await Promise.resolve();
    expect(runtime.getViewerApplication().scene).toBe(sceneA);

    hooks.fire("canvasTearDown", { scene: sceneA });
    await Promise.resolve();
    hooks.fire("canvasReady", { scene: sceneB });
    await Promise.resolve();
    expect(FakeViewer.instances[0].close).toHaveBeenCalledOnce();
    expect(runtime.getViewerApplication().scene).toBe(sceneB);

    hooks.fire("canvasTearDown", { scene: sceneB });
    await Promise.resolve();
    hooks.fire("canvasReady", { scene: unsupported });
    await Promise.resolve();
    expect(runtime.getViewerApplication()).toBeNull();

    hooks.fire("canvasReady", { scene: sceneA });
    await Promise.resolve();
    expect(runtime.getViewerApplication().scene).toBe(sceneA);
  });

  it("suppresses auto-open after manual close in one Scene session but reopens via keybinding", async () => {
    FakeViewer.instances = [];
    const hooks = createFakeFoundryHooks();
    const keybindings = { register: vi.fn() };
    const runtime = createRuntime({
      hooks,
      keybindings,
      settings: { register: vi.fn(), get: vi.fn(() => true) },
      synchronizationScheduler: frameScheduler(),
      viewerApplicationClass: FakeViewer
    });
    runtime.initialize();
    expect(keybindings.register).toHaveBeenCalledWith(
      MODULE_ID,
      "reopenViewer",
      expect.objectContaining({ name: expect.any(String), onDown: expect.any(Function) })
    );

    const scene = makeScene("scene-session");
    vi.stubGlobal("canvas", { scene });
    hooks.fire("canvasReady", { scene });
    await Promise.resolve();
    await runtime.closeViewer();
    expect(runtime.getViewerApplication()).toBeNull();

    hooks.fire("canvasReady", { scene });
    await Promise.resolve();
    expect(runtime.getViewerApplication()).toBeNull();

    const keybinding = keybindings.register.mock.calls[0][2];
    keybinding.onDown();
    await Promise.resolve();
    expect(runtime.getViewerApplication().scene).toBe(scene);
    vi.unstubAllGlobals();
  });

  it("respects the user auto-open preference while leaving the keybinding available", async () => {
    FakeViewer.instances = [];
    const hooks = createFakeFoundryHooks();
    const keybindings = { register: vi.fn() };
    const settings = {
      register: vi.fn(),
      get: vi.fn((namespace, key) => key === "autoOpen" ? false : {})
    };
    const runtime = createRuntime({
      hooks,
      keybindings,
      settings,
      synchronizationScheduler: frameScheduler(),
      viewerApplicationClass: FakeViewer
    });
    runtime.initialize();
    const scene = makeScene("scene-no-auto-open");
    vi.stubGlobal("canvas", { scene });

    hooks.fire("canvasReady", { scene });
    await Promise.resolve();
    expect(runtime.getViewerApplication()).toBeNull();

    keybindings.register.mock.calls[0][2].onDown();
    await Promise.resolve();
    expect(runtime.getViewerApplication().scene).toBe(scene);
    vi.unstubAllGlobals();
  });

  it("closes an open viewer when an external Scene update disables it", async () => {
    FakeViewer.instances = [];
    const hooks = createFakeFoundryHooks();
    const runtime = createRuntime({
      hooks,
      settings: { register: vi.fn(), get: vi.fn(() => true) },
      synchronizationScheduler: frameScheduler(),
      viewerApplicationClass: FakeViewer
    });
    runtime.initialize();
    const scene = makeScene("scene-update");
    hooks.fire("canvasReady", { scene });
    await Promise.resolve();

    scene.flags[MODULE_ID].enabled = false;
    hooks.fire("updateScene", scene, { flags: { [MODULE_ID]: { enabled: false } } });
    await Promise.resolve();

    expect(FakeViewer.instances[0].close).toHaveBeenCalledOnce();
    expect(runtime.getViewerApplication()).toBeNull();
  });

  it("rebuilds current external rotation/elevation and drops participation or invisible tokens", () => {
    const grid = createFakeSquareGrid({ distance: 5 });
    const scene = {
      ...makeScene("scene-documents"),
      grid,
      tokens: []
    };
    const token = {
      id: "ship",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      elevation: 7.5,
      rotation: 17,
      flags: { [MODULE_ID]: { enabled: true, pitch: 0 } },
      object: { isVisible: true }
    };
    scene.tokens.push(token);
    const runtime = createRuntime({ currentUser: { isGM: false } });
    const stateService = runtime.getService("tacticalState");

    expect(stateService.getVisibleTacticalStates(scene)).toEqual([
      expect.objectContaining({
        tokenId: "ship",
        heading: 197,
        elevation: 7.5,
        tacticalZ: 1.5,
        offGrid: true
      })
    ]);

    token.rotation = 23;
    token.elevation = 15;
    token.flags[MODULE_ID].enabled = false;
    expect(stateService.getVisibleTacticalStates(scene)).toEqual([]);

    token.flags[MODULE_ID].enabled = true;
    token.object.isVisible = false;
    expect(stateService.getVisibleTacticalStates(scene)).toEqual([]);
  });
});
