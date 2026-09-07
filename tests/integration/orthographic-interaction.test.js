import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  createEastRenderModel,
  createSouthRenderModel,
  createWestRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { PanelInputController } from "../../scripts/viewer/panel-input-controller.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";

function surface() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 400 })
  };
}

function pointer(type, clientX, clientY) {
  return {
    type,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY,
    preventDefault: vi.fn()
  };
}

const scene = makeSquareScene(createFakeSquareGrid({ size: 100, distance: 5 }));

function makeSideController(view) {
  const token = {
    id: "ship",
    x: 100,
    y: 200,
    width: 1,
    height: 1,
    elevation: 5,
    rotation: 180,
    flags: { "tactical-3d-viewer": { pitch: 0 } }
  };
  const service = {
    captureInteractionSnapshot: vi.fn(() => ({
      x: token.x,
      y: token.y,
      elevation: token.elevation,
      rotation: token.rotation,
      pitch: 0
    })),
    moveVisibleAxes: vi.fn(async () => ({ status: "accepted", ok: true }))
  };
  const visibleAxes = {
    top: ["x", "y"],
    north: ["x", "z"],
    south: ["x", "z"],
    east: ["y", "z"],
    west: ["y", "z"]
  }[view];
  const camera = {
    view,
    focus: { x: 1.5, y: 2.5, z: 1 },
    scale: 100,
    screenCenter: { x: 200, y: 200 }
  };
  const controller = new PanelInputController({
    element: surface(),
    panel: { view, zoom: 100 },
    scene,
    coordinateAdapter: new CoordinateAdapter(),
    tacticalUpdateService: service,
    getTokenById: () => token,
    getRenderModel: () => ({
      view,
      camera,
      tokens: [{
        tokenId: "ship",
        point: { x: 200, y: 200 },
        markerRadius: 30,
        visibleToCurrentUser: true,
        canCurrentUserMove: true,
        participating: true
      }]
    })
  });
  return { controller, service, visibleAxes };
}

async function drag(controller, endX, endY) {
  controller.handlePointerDown(pointer("pointerdown", 200, 200));
  controller.handlePointerMove(pointer("pointermove", endX, endY));
  await controller.handlePointerUp(pointer("pointerup", endX, endY));
}

describe("Prompt 18 orthographic render models", () => {
  const state = {
    tokenId: "ship",
    tacticalX: 1.5,
    tacticalY: 2.5,
    tacticalZ: 1,
    elevation: 5,
    width: 1,
    height: 1,
    heading: 90,
    pitch: 45,
    participating: true,
    visibleToCurrentUser: true
  };

  it.each([
    ["south", createSouthRenderModel],
    ["east", createEastRenderModel],
    ["west", createWestRenderModel]
  ])("renders %s with the shared projected orientation vector", (view, createModel) => {
    const model = createModel({
      scene,
      coordinateAdapter: new CoordinateAdapter(),
      tacticalStates: [state],
      viewport: { width: 500, height: 400 },
      zoom: 100,
      focus: { x: 1.5, y: 2.5, z: 1 }
    });

    expect(model.view).toBe(view);
    expect(model.tokens).toHaveLength(1);
    expect(model.tokens[0].point).toEqual({ x: 250, y: 150 });
    expect(Number.isFinite(model.tokens[0].orientation.x)).toBe(true);
    expect(Number.isFinite(model.tokens[0].orientation.y)).toBe(true);
  });

  it("mirrors South and West screen directions without changing canonical coordinates", () => {
    const common = {
      scene,
      coordinateAdapter: new CoordinateAdapter(),
      tacticalStates: [state],
      viewport: { width: 500, height: 400 },
      zoom: 100,
      focus: { x: 1.5, y: 2.5, z: 1 }
    };
    const south = createSouthRenderModel({
      ...common,
      tacticalStates: [{ ...state, tacticalX: 2.5 }]
    });
    const west = createWestRenderModel({
      ...common,
      tacticalStates: [{ ...state, tacticalY: 3.5 }]
    });

    expect(south.tokens[0]).toMatchObject({ tacticalX: 2.5, tacticalY: 2.5, tacticalZ: 1 });
    expect(south.tokens[0].point.x).toBe(150);
    expect(west.tokens[0]).toMatchObject({ tacticalX: 1.5, tacticalY: 3.5, tacticalZ: 1 });
    expect(west.tokens[0].point.x).toBe(150);
  });

  it.each(["top", "north", "south", "east", "west"])(
    "routes %s through the shared renderer model builder",
    (view) => {
      const model = new Canvas2DRendererV1().buildModel({
        scene,
        state: { panels: [{ view, zoom: 100, focus: { x: 1.5, y: 2.5, z: 1 } }] },
        viewport: { width: 500, height: 400 },
        visibleTacticalStates: [state]
      });

      expect(model.view).toBe(view);
    }
  );
});

describe("Prompt 18 projection-driven side input", () => {
  it.each([
    ["top", 300, 200, { x: 1, y: 0 }],
    ["top", 100, 200, { x: -1, y: 0 }],
    ["top", 200, 100, { x: 0, y: 1 }],
    ["top", 200, 300, { x: 0, y: -1 }],
    ["south", 100, 200, { x: 1, z: 0 }],
    ["south", 300, 200, { x: -1, z: 0 }],
    ["east", 300, 200, { y: 1, z: 0 }],
    ["east", 100, 200, { y: -1, z: 0 }],
    ["west", 100, 200, { y: 1, z: 0 }],
    ["west", 300, 200, { y: -1, z: 0 }],
    ["south", 200, 300, { x: 0, z: -1 }],
    ["south", 200, 100, { x: 0, z: 1 }],
    ["east", 200, 300, { y: 0, z: -1 }],
    ["east", 200, 100, { y: 0, z: 1 }],
    ["west", 200, 300, { y: 0, z: -1 }],
    ["west", 200, 100, { y: 0, z: 1 }]
  ])("moves the visible %s axis in the projected screen direction", async (view, endX, endY, delta) => {
    const { controller, service, visibleAxes } = makeSideController(view);

    await drag(controller, endX, endY);

    expect(Object.keys(delta).every((axis) => visibleAxes.includes(axis))).toBe(true);
    expect(service.moveVisibleAxes).toHaveBeenCalledOnce();
    expect(service.moveVisibleAxes).toHaveBeenCalledWith(
      expect.any(Object),
      scene,
      visibleAxes,
      delta,
      expect.any(Object)
    );
  });

  it("uses one shared update call for a diagonal East movement and preserves X", async () => {
    const { controller, service } = makeSideController("east");

    await drag(controller, 300, 300);

    expect(service.moveVisibleAxes).toHaveBeenCalledTimes(1);
    expect(service.moveVisibleAxes.mock.calls[0][2]).toEqual(["y", "z"]);
    expect(service.moveVisibleAxes.mock.calls[0][3]).toEqual({ y: 1, z: -1 });
  });
});
