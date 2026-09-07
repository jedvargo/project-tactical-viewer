import { describe, expect, it, vi } from "vitest";

import {
  PanelInputController
} from "../../scripts/viewer/panel-input-controller.js";
import {
  getPanelLayoutState
} from "../../scripts/viewer/panel-layout.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";

function surface() {
  const listeners = new Map();
  return {
    listeners,
    style: {},
    tabIndex: -1,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    focus: vi.fn()
  };
}

function controllerFor({ view = "top", selected = true, canMove = true, onDeleteToken } = {}) {
  const element = surface();
  const tokenDocument = { id: "ship", x: 100, y: 100, elevation: 10 };
  const tacticalUpdateService = {
    captureInteractionSnapshot: vi.fn(() => ({
      x: 100, y: 100, elevation: 10, rotation: 0, pitch: 0
    })),
    moveVisibleAxes: vi.fn(async () => ({ status: "accepted", ok: true }))
  };
  const controller = new PanelInputController({
    element,
    panel: { view, zoom: 64, focus: { x: 2, y: 2, z: 1 } },
    scene: { id: "scene" },
    tacticalUpdateService,
    getTokenById: () => tokenDocument,
    getSelectedTokenState: () => selected ? {
      tokenId: "ship",
      visibleToCurrentUser: true,
      canCurrentUserMove: canMove,
      canCurrentUserRotate: true,
      heading: 0,
      pitch: 0
    } : null,
    onDeleteToken,
    getRenderModel: () => ({
      view,
      camera: {
        view,
        focus: { x: 2, y: 2, z: 1 },
        scale: 64,
        screenCenter: { x: 200, y: 150 }
      },
      tokens: []
    })
  });
  return { controller, element, tacticalUpdateService };
}

describe("Prompt 27 keyboard and responsive seams", () => {
  it("moves one visible cell through the same update-service path as pointer movement", async () => {
    const { controller, element, tacticalUpdateService } = controllerFor();
    const event = {
      type: "keydown",
      key: "ArrowRight",
      target: element,
      preventDefault: vi.fn()
    };

    await controller.handleKeyDown(event);

    expect(tacticalUpdateService.moveVisibleAxes).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      ["x", "y"],
      { x: 1, y: 0 },
      expect.any(Object)
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("maps focused-panel shortcuts to heading and pitch alternatives", async () => {
    const heading = vi.fn();
    const pitch = vi.fn();
    const { controller, element } = controllerFor();
    controller.onHeadingDelta = heading;
    controller.onPitchDelta = pitch;

    await controller.handleKeyDown({ key: "]", target: element, preventDefault: vi.fn() });
    await controller.handleKeyDown({ key: ".", target: element, preventDefault: vi.fn() });

    expect(heading).toHaveBeenCalledWith(45);
    expect(pitch).toHaveBeenCalledWith(1);
  });

  it("supports vertical Z steps and does not intercept editable control typing", async () => {
    const vertical = controllerFor({ view: "north" });
    await vertical.controller.handleKeyDown({
      key: "PageUp",
      target: vertical.element,
      preventDefault: vi.fn()
    });
    expect(vertical.tacticalUpdateService.moveVisibleAxes).toHaveBeenCalledWith(
      expect.any(Object), expect.any(Object), ["x", "z"], { x: 0, z: 1 }, expect.any(Object)
    );

    const editable = { tagName: "INPUT", value: "typing" };
    const blocked = controllerFor();
    await blocked.controller.handleKeyDown({
      key: "ArrowRight",
      target: editable,
      preventDefault: vi.fn()
    });
    expect(blocked.tacticalUpdateService.moveVisibleAxes).not.toHaveBeenCalled();
  });

  it("moves Z through the dedicated update path even when Top hides Z", async () => {
    const element = surface();
    const moveZ = vi.fn(async () => ({ status: "accepted", ok: true }));
    const controller = new PanelInputController({
      element,
      panel: { view: "top", zoom: 64, focus: { x: 2, y: 2, z: 1 } },
      scene: { id: "scene" },
      tacticalUpdateService: {
        captureInteractionSnapshot: vi.fn(() => ({ x: 100, y: 100, elevation: 10 })),
        moveZ
      },
      getTokenById: () => ({ id: "ship" }),
      getSelectedTokenState: () => ({
        tokenId: "ship",
        visibleToCurrentUser: true,
        canCurrentUserMove: true
      }),
      getRenderModel: () => ({
        view: "top",
        camera: {
          view: "top",
          focus: { x: 2, y: 2, z: 1 },
          scale: 64,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: []
      })
    });

    await controller.handleKeyDown({
      key: "PageUp",
      target: element,
      preventDefault: vi.fn()
    });

    expect(moveZ).toHaveBeenCalledWith(
      { id: "ship" },
      { id: "scene" },
      { x: 0, y: 0, z: 1 },
      { elevation: 10, x: 100, y: 100 }
    );
  });

  it("rejects unauthorized keyboard movement before invoking the update service", async () => {
    const { controller, tacticalUpdateService } = controllerFor({ canMove: false });
    await controller.handleKeyDown({
      key: "ArrowRight",
      target: controller.element,
      preventDefault: vi.fn()
    });
    expect(tacticalUpdateService.moveVisibleAxes).not.toHaveBeenCalled();
  });

  it("focuses the canvas after pointer interaction and deletes through Delete/Backspace", async () => {
    const onDeleteToken = vi.fn(async () => ({ status: "accepted", ok: true }));
    const { controller, element } = controllerFor({ onDeleteToken });
    controller.handlePointerDown({
      pointerId: 1,
      button: 0,
      clientX: 200,
      clientY: 150,
      preventDefault: vi.fn()
    });
    expect(element.focus).toHaveBeenCalledOnce();

    const event = { key: "Delete", target: element, preventDefault: vi.fn() };
    await controller.handleKeyDown(event);
    expect(onDeleteToken).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("handles arrow keys when focus remains on a direction control", async () => {
    const { controller, tacticalUpdateService } = controllerFor();
    const directionButton = { tagName: "BUTTON" };
    const event = { key: "ArrowRight", target: directionButton, preventDefault: vi.fn() };

    await controller.handleKeyDown(event);

    expect(tacticalUpdateService.moveVisibleAxes).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("serializes rapid cursor presses so each movement uses the latest update", async () => {
    const { controller, tacticalUpdateService } = controllerFor();
    let releaseFirst;
    tacticalUpdateService.moveVisibleAxes
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
      .mockResolvedValue({ status: "accepted", ok: true });

    const first = controller.handleKeyDown({
      key: "ArrowRight", target: controller.element, preventDefault: vi.fn()
    });
    const second = controller.handleKeyDown({
      key: "ArrowLeft", target: controller.element, preventDefault: vi.fn()
    });

    expect(tacticalUpdateService.moveVisibleAxes).toHaveBeenCalledOnce();
    releaseFirst({ status: "accepted", ok: true });
    await Promise.all([first, second]);

    expect(tacticalUpdateService.moveVisibleAxes).toHaveBeenCalledTimes(2);
    expect(tacticalUpdateService.moveVisibleAxes.mock.calls.map(([, , , delta]) => delta))
      .toEqual([{ x: 1, y: 0 }, { x: -1, y: 0 }]);
  });

  it("does not move a token beyond the configured five-cell Z volume", async () => {
    const grid = createFakeSquareGrid();
    const scene = makeSquareScene(grid);
    const tokenDocument = { id: "ship", x: 0, y: 0, width: 1, height: 1, elevation: 20 };
    const moveVisibleAxes = vi.fn(async () => ({ status: "accepted", ok: true }));
    const controller = new PanelInputController({
      element: surface(),
      panel: { view: "north", zoom: 64, focus: { x: 0.5, y: 0.5, z: 4 } },
      scene,
      coordinateAdapter: new CoordinateAdapter(),
      tacticalUpdateService: {
        captureInteractionSnapshot: vi.fn(() => ({ x: 0, y: 0, elevation: 20 })),
        moveVisibleAxes
      },
      getTokenById: () => tokenDocument,
      getSelectedTokenState: () => ({
        tokenId: "ship",
        width: 1,
        height: 1,
        depth: 1,
        tacticalX: 0.5,
        tacticalY: 0.5,
        tacticalZ: 4,
        visibleToCurrentUser: true,
        canCurrentUserMove: true
      }),
      getRenderModel: () => ({
        view: "north",
        grid: { columns: 12, rows: 10, depth: 5 },
        camera: {
          view: "north",
          focus: { x: 0.5, y: 0.5, z: 4 },
          scale: 64,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: []
      })
    });

    await controller.handleKeyDown({
      key: "PageUp",
      target: controller.element,
      preventDefault: vi.fn()
    });

    expect(moveVisibleAxes).not.toHaveBeenCalled();
  });

  it("maps North cursor Up to positive Z like pointer movement", () => {
    const { controller } = controllerFor({ view: "north" });

    expect(controller.keyboardDelta("ArrowUp")).toEqual({ z: 1 });
    expect(controller.keyboardDelta("ArrowDown")).toEqual({ z: -1 });
  });

  it("maps all four arrow keys to the visible axes of the named views", () => {
    expect(controllerFor({ view: "top" }).controller.keyboardDelta("ArrowRight"))
      .toEqual({ x: 1 });
    expect(controllerFor({ view: "bottom" }).controller.keyboardDelta("ArrowRight"))
      .toEqual({ x: -1 });
    expect(controllerFor({ view: "left" }).controller.keyboardDelta("ArrowRight"))
      .toEqual({ y: -1 });
    expect(controllerFor({ view: "right" }).controller.keyboardDelta("ArrowLeft"))
      .toEqual({ y: -1 });
    expect(controllerFor({ view: "front" }).controller.keyboardDelta("ArrowUp"))
      .toEqual({ z: 1 });
    expect(controllerFor({ view: "back" }).controller.keyboardDelta("ArrowUp"))
      .toEqual({ z: 1 });
    expect(controllerFor({ view: "isometric" }).controller.keyboardDelta("ArrowLeft"))
      .toBeNull();
  });

  it("reports when a panel count cannot fit its minimum two-column footprint", () => {
    expect(getPanelLayoutState(4, 320)).toMatchObject({
      narrow: true,
      columns: 1,
      recommendedPanelCount: 2,
      warning: expect.any(String)
    });
    expect(getPanelLayoutState(2, 500)).toMatchObject({
      narrow: false,
      columns: 2,
      warning: ""
    });
  });
});
