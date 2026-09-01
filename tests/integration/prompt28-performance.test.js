import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  createTopRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { ProjectionEngine } from "../../scripts/projection/projection-engine.js";
import { createFakeSquareGrid } from "../helpers/fake-grid.js";
import { createTacticalViewerApplicationClass } from "../../scripts/viewer/tactical-viewer-application.js";

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn()
  };
}

function scene() {
  return {
    id: "scene-28",
    grid: createFakeSquareGrid({ size: 100, distance: 5 }),
    dimensions: { width: 1000, height: 1000 }
  };
}

function token(tokenId, tacticalX, tacticalY) {
  return {
    tokenId,
    name: tokenId,
    tacticalX,
    tacticalY,
    tacticalZ: 0,
    elevation: 0,
    width: 1,
    height: 1,
    heading: 0,
    pitch: 0,
    participating: true,
    visibleToCurrentUser: true,
    art: { preset: "marker" }
  };
}

function model(currentScene, tacticalStates, overrides = {}) {
  return createTopRenderModel({
    scene: currentScene,
    coordinateAdapter: new CoordinateAdapter(),
    projectionEngine: new ProjectionEngine(),
    tacticalStates,
    viewport: { width: 600, height: 400 },
    zoom: 40,
    focus: { x: 5, y: 5, z: 0 },
    ...overrides
  });
}

function scheduler() {
  const callbacks = [];
  const schedule = vi.fn((callback) => {
    callbacks.push(callback);
    return callback;
  });
  schedule.flush = () => callbacks.splice(0).forEach((callback) => callback());
  schedule.pendingCount = () => callbacks.length;
  return schedule;
}

class FakeApplicationV2 {
  static DEFAULT_OPTIONS = {};

  async render() {
    this.element = await this._renderHTML({}, {});
    await this._onRender({}, {});
    return this;
  }

  async close() {
    await this._preClose({});
  }
}

describe("Prompt 28 rendering performance", () => {
  it("reuses static layers for multiple panels and keeps the cache bounded", () => {
    const currentScene = scene();
    const surfaceContext = context();
    let surfaceCount = 0;
    const canvas = {
      width: 600,
      height: 400,
      ownerDocument: {
        createElement: vi.fn(() => {
          surfaceCount += 1;
          return {
            getContext: () => surfaceContext
          };
        })
      }
    };
    const renderer = new Canvas2DRendererV1({ maxStaticLayers: 2 });
    const first = model(currentScene, [token("first", 5.5, 5.5)]);
    const second = model(currentScene, [token("second", 5.5, 5.5)], { pan: { x: 20, y: 0 } });

    renderer.render({ canvas, context: context(), viewport: { width: 600, height: 400 }, model: first });
    renderer.render({ canvas, context: context(), viewport: { width: 600, height: 400 }, model: second });
    renderer.render({ canvas, context: context(), viewport: { width: 600, height: 400 }, model: first });

    expect(surfaceCount).toBe(2);
    expect(renderer.staticLayerCacheSize).toBe(2);
  });

  it("reuses projected grid geometry while token state is rebuilt", () => {
    const currentScene = scene();
    const renderer = new Canvas2DRendererV1();
    const panel = {
      view: "top",
      zoom: 40,
      focus: { x: 5, y: 5, z: 0 },
      pan: { x: 0, y: 0 },
      overlays: { grid: true }
    };
    const input = {
      scene: currentScene,
      panel,
      panelIndex: 0,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 1,
      visibleTacticalStates: [token("ship", 5.5, 5.5)]
    };

    const first = renderer.buildModel(input);
    const second = renderer.buildModel(input);

    expect(second.grid).toBe(first.grid);
  });

  it("records culling and render work only when debug metrics are enabled", () => {
    const currentScene = scene();
    const assetManager = {
      peekArt: vi.fn(() => null),
      loadArt: vi.fn(async () => null)
    };
    const renderer = new Canvas2DRendererV1({ assetManager, debug: true });
    renderer.render({
      canvas: { width: 600, height: 400 },
      context: context(),
      viewport: { width: 600, height: 400 },
      model: model(currentScene, [
        token("visible", 5.5, 5.5),
        token("offscreen", 100, 100)
      ])
    });

    expect(renderer.getDebugMetrics()).toMatchObject({
      frames: 1,
      visibleTokens: 1,
      culledTokens: 1,
      artLookups: 1
    });
    expect(new Canvas2DRendererV1().getDebugMetrics()).toBeNull();
  });

  it("does not repaint after an idle frame has already been flushed", async () => {
    const frame = scheduler();
    const renderer = { render: vi.fn() };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const app = new Application({
      scene: scene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      renderer,
      scheduler: frame,
      document: {
        createElement: () => ({
          children: [],
          append() {},
          appendChild() {},
          querySelector: () => null,
          querySelectorAll: () => [],
          setAttribute() {},
          addEventListener() {},
          style: {},
          dataset: {},
          getBoundingClientRect: () => ({ width: 600, height: 400 })
        })
      },
      devicePixelRatio: 1
    });

    await app.render(true);
    frame.flush();
    const rendersAfterInitialFrame = renderer.render.mock.calls.length;
    frame.flush();

    expect(rendersAfterInitialFrame).toBe(1);
    expect(renderer.render).toHaveBeenCalledTimes(rendersAfterInitialFrame);
    expect(frame.pendingCount()).toBe(0);
  });

  it("invalidates the renderer and schedules one repaint for a resize", async () => {
    const frame = scheduler();
    const invalidate = vi.fn();
    const renderer = { render: vi.fn(), invalidate };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const app = new Application({
      scene: scene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      renderer,
      scheduler: frame,
      document: {
        createElement: () => ({
          children: [],
          append() {},
          appendChild() {},
          querySelector: () => null,
          querySelectorAll: () => [],
          setAttribute() {},
          addEventListener() {},
          style: {},
          dataset: {},
          getBoundingClientRect: () => ({ width: 600, height: 400 })
        })
      },
      devicePixelRatio: 1
    });

    await app.render(true);
    frame.flush();
    invalidate.mockClear();
    app.updateViewport({ width: 500, height: 300 }, 0);

    expect(invalidate).toHaveBeenCalledWith({ type: "resize", panelIndex: 0 });
    expect(frame.pendingCount()).toBe(1);
  });
});
