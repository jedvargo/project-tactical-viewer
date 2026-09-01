import { describe, expect, it, vi } from "vitest";

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

function makeNorthFixture({ elevation = 5, y = 200 } = {}) {
  const grid = createFakeSquareGrid({ size: 100, distance: 5 });
  const scene = makeSquareScene(grid);
  const token = {
    id: "ship",
    x: 100,
    y,
    width: 1,
    height: 1,
    elevation,
    rotation: 180,
    flags: { "tactical-3d-viewer": { pitch: 0 } }
  };
  const tacticalX = 1.5;
  const tacticalY = y / 100 + 0.5;
  const tacticalZ = elevation / 5;
  const service = {
    captureInteractionSnapshot: vi.fn(() => ({
      x: token.x,
      y: token.y,
      elevation: token.elevation,
      rotation: token.rotation,
      pitch: 0
    })),
    moveXZ: vi.fn(async () => ({ status: "accepted", ok: true }))
  };
  const previews = [];
  const controller = new PanelInputController({
    element: surface(),
    panel: { view: "north", zoom: 100 },
    scene,
    coordinateAdapter: new CoordinateAdapter(),
    tacticalUpdateService: service,
    getTokenById: () => token,
    getRenderModel: () => ({
      view: "north",
      camera: {
        view: "north",
        focus: { x: tacticalX, y: tacticalY, z: tacticalZ },
        scale: 100,
        screenCenter: { x: 200, y: 200 }
      },
      tokens: [{
        tokenId: "ship",
        point: { x: 200, y: 200 },
        markerRadius: 30,
        visibleToCurrentUser: true,
        canCurrentUserMove: true,
        participating: true
      }]
    }),
    onMovementPreview: (preview) => previews.push(preview)
  });
  return { controller, service, previews, token };
}

async function drag(controller, endX, endY) {
  controller.handlePointerDown(pointer("pointerdown", 200, 200));
  controller.handlePointerMove(pointer("pointermove", endX, endY));
  await controller.handlePointerUp(pointer("pointerup", endX, endY));
}

describe("North X/Z tactical interaction", () => {
  it.each([
    [300, 200, { x: 1, z: 0 }],
    [200, 100, { x: 0, z: 1 }],
    [300, 100, { x: 1, z: 1 }]
  ])("commits X/Z delta %j while preserving Y", async (endX, endY, delta) => {
    const { controller, service, previews } = makeNorthFixture();

    await drag(controller, endX, endY);

    expect(previews).toContainEqual(expect.objectContaining({
      tacticalY: 2.5,
      delta
    }));
    expect(service.moveXZ).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      delta,
      expect.any(Object)
    );
  });

  it("supports a negative-Z move from North", async () => {
    const { controller, service, previews } = makeNorthFixture({ elevation: 0 });

    await drag(controller, 200, 300);

    expect(previews).toContainEqual(expect.objectContaining({
      tacticalY: 2.5,
      tacticalZ: -1,
      delta: { x: 0, z: -1 }
    }));
    expect(service.moveXZ).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { x: 0, z: -1 },
      expect.any(Object)
    );
  });

  it("shows a true off-step starting elevation and snaps it only for a vertical action", async () => {
    const { controller, service, previews, token } = makeNorthFixture({ elevation: 7.5 });

    controller.handlePointerDown(pointer("pointerdown", 200, 200));
    controller.handlePointerMove(pointer("pointermove", 200, 100));

    expect(previews.at(-1)).toMatchObject({
      tacticalZ: 3,
      elevation: 15,
      offGrid: false,
      delta: { x: 0, z: 1 }
    });
    expect(token.elevation).toBe(7.5);
    expect(service.moveXZ).not.toHaveBeenCalled();
  });
});
