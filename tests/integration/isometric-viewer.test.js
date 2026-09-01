import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  createIsometricRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { orientationVector } from "../../scripts/model/orientation-math.js";
import { ProjectionEngine } from "../../scripts/projection/projection-engine.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";
import { PanelInputController } from "../../scripts/viewer/panel-input-controller.js";

const ISO_VIEWS = ["iso-ne", "iso-se", "iso-sw", "iso-nw"];
const projectionEngine = new ProjectionEngine();

function tacticalState(overrides = {}) {
  return {
    tokenId: "ship-1",
    name: "Aurora",
    tacticalX: 2,
    tacticalY: 3,
    tacticalZ: 1,
    elevation: 5,
    width: 1,
    height: 1,
    heading: 90,
    pitch: 45,
    participating: true,
    visibleToCurrentUser: true,
    ...overrides
  };
}

function scene() {
  return makeSquareScene(createFakeSquareGrid({ size: 100, distance: 5 }));
}

describe("Prompt 21 isometric rendering", () => {
  it.each(ISO_VIEWS)("renders %s at the ProjectionEngine XYZ position", (view) => {
    const currentScene = scene();
    const camera = {
      view,
      focus: { x: 0, y: 0, z: 0 },
      scale: 20,
      screenCenter: { x: 300, y: 220 }
    };
    const model = createIsometricRenderModel({
      view,
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine,
      tacticalStates: [tacticalState()],
      viewport: { width: 600, height: 440 },
      zoom: camera.scale,
      focus: camera.focus
    });

    expect(model.view).toBe(view);
    expect(model.tokens[0].point).toEqual(
      projectionEngine.projectPoint(
        { x: 2, y: 3, z: 1 },
        model.camera
      )
    );
    expect(model.tokens[0].orientation).toEqual(
      projectionEngine.projectOrientationVector(
        orientationVector(90, 45),
        { ...model.camera, scale: model.camera.scale * 0.5 }
      )
    );
    expect(model.grid.lines.every((line) =>
      ["x", "y", "z"].includes(line.axis)
      && line.start && line.end
    )).toBe(true);
  });

  it("renders only visible participating tokens and draws the isometric grid", () => {
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine,
      tacticalStates: [
        tacticalState({ tokenId: "visible" }),
        tacticalState({ tokenId: "hidden", visibleToCurrentUser: false }),
        tacticalState({ tokenId: "ignored", participating: false })
      ],
      viewport: { width: 600, height: 440 },
      zoom: 20,
      focus: { x: 3, y: 2.5, z: 0 }
    });

    expect(model.tokens.map(({ tokenId }) => tokenId)).toEqual(["visible"]);
    expect(model.grid.lines.some(({ axis }) => axis === "x")).toBe(true);
    expect(model.grid.lines.some(({ axis }) => axis === "y")).toBe(true);
    expect(model.grid.lines.some(({ axis }) => axis === "z")).toBe(true);
  });

  it("draws an isometric model through Canvas2DRendererV1", () => {
    const calls = [];
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn((...args) => calls.push(args)),
      setLineDash: vi.fn()
    };
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      tacticalStates: [tacticalState()],
      viewport: { width: 600, height: 440 },
      zoom: 20,
      focus: { x: 3, y: 2.5, z: 0 }
    });

    expect(new Canvas2DRendererV1().render({
      canvas: { width: 600, height: 440 },
      context,
      viewport: { width: 600, height: 440 },
      model
    })).toBe(true);
    expect(context.arc).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    expect(calls.some(([label]) => String(label).includes("Isometric"))).toBe(false);
  });
});

describe("Prompt 21 isometric input", () => {
  it("pans and zooms in screen space without an inverse 3D mouse mapping", () => {
    const element = {
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 })
    };
    const panel = {
      view: "iso-ne",
      zoom: 50,
      focus: { x: 2, y: 2, z: 1 },
      pan: { x: 0, y: 0 }
    };
    const controller = new PanelInputController({
      element,
      panel,
      getRenderModel: () => ({
        view: "iso-ne",
        camera: {
          view: "iso-ne",
          focus: panel.focus,
          scale: panel.zoom,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: []
      })
    });

    controller.panBy({ x: 40, y: -20 });
    controller.zoomAt({ x: 200, y: 150 }, 2);

    expect(panel.pan).toEqual({ x: 40, y: -20 });
    expect(panel.zoom).toBe(100);
    expect(panel.focus).toEqual({ x: 2, y: 2, z: 1 });
  });

  it("does not call TacticalUpdateService when a token is dragged in isometric view", async () => {
    const element = {
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 })
    };
    const panel = { view: "iso-ne", zoom: 50, focus: { x: 2, y: 2, z: 1 }, pan: { x: 0, y: 0 } };
    const tokenDocument = { id: "ship-1", x: 100, y: 100, width: 1, height: 1, elevation: 5 };
    const tacticalUpdateService = {
      captureInteractionSnapshot: vi.fn(),
      moveVisibleAxes: vi.fn()
    };
    const feedback = vi.fn();
    const controller = new PanelInputController({
      element,
      panel,
      scene: scene(),
      coordinateAdapter: new CoordinateAdapter(),
      tacticalUpdateService,
      getTokenById: () => tokenDocument,
      getRenderModel: () => ({
        view: "iso-ne",
        camera: {
          view: "iso-ne",
          focus: panel.focus,
          scale: panel.zoom,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: [{
          tokenId: "ship-1",
          point: { x: 100, y: 100 },
          markerRadius: 20,
          visibleToCurrentUser: true,
          canCurrentUserMove: true
        }]
      }),
      onActionResult: feedback
    });

    controller.handlePointerDown({ pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    controller.handlePointerMove({ pointerId: 1, clientX: 140, clientY: 120, preventDefault: vi.fn() });
    await controller.handlePointerUp({ pointerId: 1, clientX: 140, clientY: 120, preventDefault: vi.fn() });

    expect(tacticalUpdateService.moveVisibleAxes).not.toHaveBeenCalled();
    expect(feedback).toHaveBeenCalledWith({
      status: "read-only",
      reason: "isometric-movement-disabled"
    }, expect.anything());
  });
});
