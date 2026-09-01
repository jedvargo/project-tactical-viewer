import { describe, expect, it, vi } from "vitest";

import {
  PanelInputController
} from "../../scripts/viewer/panel-input-controller.js";
import {
  getPanelLayoutState
} from "../../scripts/viewer/panel-layout.js";

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
    releasePointerCapture: vi.fn()
  };
}

function controllerFor({ view = "top", selected = true, canMove = true } = {}) {
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

  it("rejects unauthorized keyboard movement before invoking the update service", async () => {
    const { controller, tacticalUpdateService } = controllerFor({ canMove: false });
    await controller.handleKeyDown({
      key: "ArrowRight",
      target: controller.element,
      preventDefault: vi.fn()
    });
    expect(tacticalUpdateService.moveVisibleAxes).not.toHaveBeenCalled();
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
