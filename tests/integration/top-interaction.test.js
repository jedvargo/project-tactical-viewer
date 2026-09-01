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

function makeDocument({ x = 0, y = 0, width = 1, height = 1, elevation = 15 } = {}) {
  return {
    id: "ship",
    x,
    y,
    width,
    height,
    elevation,
    rotation: 180,
    flags: { "tactical-3d-viewer": { pitch: 0 } }
  };
}

function makeModel(token, { canMove = true } = {}) {
  const anchor = {
    x: token.x / 100 + token.width / 2,
    y: token.y / 100 + token.height / 2
  };
  return {
    view: "top",
    camera: {
      view: "top",
      focus: { x: anchor.x, y: anchor.y, z: 3 },
      scale: 100,
      screenCenter: { x: 200, y: 150 }
    },
    tokens: [{
      tokenId: token.id,
      point: { x: 200, y: 150 },
      markerRadius: 30,
      visibleToCurrentUser: true,
      canCurrentUserMove: canMove,
      participating: true
    }]
  };
}

function makeController({ token = makeDocument(), canMove = true, updateResult } = {}) {
  const grid = createFakeSquareGrid();
  const scene = makeSquareScene(grid);
  const coordinateAdapter = new CoordinateAdapter();
  const previewEvents = [];
  const actionResult = vi.fn();
  const service = {
    captureInteractionSnapshot: vi.fn(() => ({
      x: token.x,
      y: token.y,
      elevation: token.elevation,
      rotation: token.rotation,
      pitch: 0
    })),
    moveXY: vi.fn(async () => updateResult ?? { status: "accepted", ok: true })
  };
  const controller = new PanelInputController({
    element: surface(),
    panel: {},
    scene,
    coordinateAdapter,
    getTokenById: () => token,
    tacticalUpdateService: service,
    getRenderModel: () => makeModel(token, { canMove }),
    onMovementPreview: (preview) => previewEvents.push(preview),
    onActionResult: actionResult,
    onSelectionChanged: vi.fn()
  });
  return { controller, service, previewEvents, actionResult, token };
}

describe("Top tactical interaction", () => {
  it("shows preview only during drag, converts a diagonal cell destination, preserves Z, and commits once", async () => {
    const { controller, service, previewEvents, token } = makeController();

    controller.handlePointerDown(pointer("pointerdown", 200, 150));
    expect(previewEvents).toHaveLength(0);

    controller.handlePointerMove(pointer("pointermove", 300, 50));
    expect(previewEvents.at(-1)).toMatchObject({
      tokenId: "ship",
      tacticalX: 1.5,
      tacticalY: 1.5,
      tacticalZ: 3,
      delta: { x: 1, y: 1 }
    });
    expect(service.moveXY).not.toHaveBeenCalled();

    await controller.handlePointerUp(pointer("pointerup", 300, 50));

    expect(service.captureInteractionSnapshot).toHaveBeenCalledOnce();
    expect(service.moveXY).toHaveBeenCalledOnce();
    expect(service.moveXY).toHaveBeenCalledWith(
      token,
      expect.any(Object),
      { x: 1, y: 1 },
      expect.any(Object)
    );
    expect(previewEvents.at(-1)).toBeNull();
    expect(token.elevation).toBe(15);
  });

  it("anchors a multi-cell token by its center for a one-cell move", () => {
    const token = makeDocument({ width: 2, height: 2 });
    const { controller, previewEvents } = makeController({ token });

    controller.handlePointerDown(pointer("pointerdown", 200, 150));
    controller.handlePointerMove(pointer("pointermove", 300, 50));

    expect(previewEvents.at(-1)).toMatchObject({
      tacticalX: 2,
      tacticalY: 2,
      delta: { x: 1, y: 1 }
    });
  });

  it("does not preview or commit movement for an unauthorized/locked token", () => {
    const { controller, service, previewEvents } = makeController({ canMove: false });

    controller.handlePointerDown(pointer("pointerdown", 200, 150));
    controller.handlePointerMove(pointer("pointermove", 300, 50));

    expect(previewEvents).toHaveLength(0);
    expect(service.moveXY).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: "rejected", ok: false, reason: "locked" }],
    [{ status: "conflict", ok: false, reason: "conflict" }]
  ])("clears a rejected/conflicting preview and reports the result", async (updateResult) => {
    const { controller, service, previewEvents, actionResult } = makeController({ updateResult });

    controller.handlePointerDown(pointer("pointerdown", 200, 150));
    controller.handlePointerMove(pointer("pointermove", 300, 50));
    await controller.handlePointerUp(pointer("pointerup", 300, 50));

    expect(service.moveXY).toHaveBeenCalledOnce();
    expect(previewEvents.at(-1)).toBeNull();
    expect(actionResult).toHaveBeenCalledWith(updateResult, expect.any(Object));
  });
});
