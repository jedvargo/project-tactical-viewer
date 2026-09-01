import { describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../scripts/constants.js";
import { createRuntime } from "../../scripts/runtime.js";
import { createTacticalViewerApplicationClass } from "../../scripts/viewer/tactical-viewer-application.js";

class FakeViewerApplication {
  static instances = [];

  constructor(options) {
    this.options = options;
    this.scene = options.scene;
    this.rendered = false;
    this.close = vi.fn(async () => {
      this.rendered = false;
    });
    FakeViewerApplication.instances.push(this);
  }

  async render() {
    this.rendered = true;
    return this;
  }
}

class ApplicationV2WithReadOnlyState {
  constructor(options = {}) {
    this.options = options;
    this._applicationState = Object.freeze({ inherited: true });
  }

  get state() {
    return this._applicationState;
  }
}

const RealViewerApplication = createTacticalViewerApplicationClass({
  ApplicationV2: ApplicationV2WithReadOnlyState
});

class OpenPathViewerApplication extends RealViewerApplication {
  async render() {
    if (typeof this._renderHTML !== "function" || typeof this._replaceHTML !== "function") {
      throw new Error("Application class is not renderable because it does not implement the abstract methods _renderHTML and _replaceHTML");
    }
    this.rendered = true;
    return this;
  }
}

function scene({ enabled = true, gridType = "square" } = {}) {
  return {
    id: "scene-1",
    grid: { type: gridType, size: 100, distance: 5 },
    dimensions: { width: 1000, height: 1000 },
    flags: { [MODULE_ID]: { enabled } }
  };
}

describe("viewer runtime opening", () => {
  it("opens only an enabled eligible Scene through the explicit runtime method", async () => {
    FakeViewerApplication.instances = [];
    const persistenceService = {
      initialize: vi.fn(),
      getSceneLayout: vi.fn(() => ({ panelCount: 1, panels: [{ view: "top" }] }))
    };
    const synchronizationCoordinator = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => {})
    };
    const runtime = createRuntime({
      viewerApplicationClass: FakeViewerApplication,
      persistenceService,
      synchronizationCoordinator
    });

    expect(await runtime.openViewer(scene({ enabled: false }))).toBeNull();
    expect(await runtime.openViewer(scene({ gridType: "hex" }))).toBeNull();
    expect(FakeViewerApplication.instances).toHaveLength(0);

    const enabledScene = scene();
    const viewer = await runtime.openViewer(enabledScene);

    expect(viewer).toBe(FakeViewerApplication.instances[0]);
    expect(viewer.rendered).toBe(true);
    expect(viewer.options.persistenceService).toBe(persistenceService);
    expect(viewer.options.synchronizationCoordinator).toBe(synchronizationCoordinator);
    expect(viewer.options.tacticalStateService).toBe(runtime.getService("tacticalState"));
    expect(viewer.options.renderer).toBe(runtime.getService("renderer"));
  });

  it("closes the active viewer before opening a different eligible Scene", async () => {
    FakeViewerApplication.instances = [];
    const runtime = createRuntime({
      viewerApplicationClass: FakeViewerApplication,
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} }
    });

    await runtime.openViewer(scene());
    const second = await runtime.openViewer({ ...scene(), id: "scene-2" });

    expect(FakeViewerApplication.instances[0].close).toHaveBeenCalledOnce();
    expect(second).toBe(FakeViewerApplication.instances[1]);
  });

  it("opens the TacticalViewerApplication path without colliding with ApplicationV2.state", async () => {
    const runtime = createRuntime({
      viewerApplicationClass: OpenPathViewerApplication,
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} }
    });

    const viewer = await runtime.openViewer(scene());

    expect(viewer).toBeInstanceOf(OpenPathViewerApplication);
    expect(viewer.state).toEqual({ inherited: true });
    expect(viewer.viewerState).toMatchObject({ panelCount: 1 });
  });
});
