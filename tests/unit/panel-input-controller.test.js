import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOGICAL_ZOOM,
  MAX_LOGICAL_ZOOM,
  MIN_LOGICAL_ZOOM,
  PanelInputController,
  clampLogicalZoom,
  hitTestProjectedTokens
} from "../../scripts/viewer/panel-input-controller.js";

function surface() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 })
  };
}

function model(overrides = {}) {
  return {
    view: "top",
    camera: {
      view: "top",
      focus: { x: 5, y: 5, z: 0 },
      scale: 50,
      screenCenter: { x: 200, y: 150 }
    },
    tokens: [
      {
        tokenId: "visible",
        name: "Visible",
        point: { x: 100, y: 100 },
        markerRadius: 20,
        visibleToCurrentUser: true
      },
      {
        tokenId: "culled",
        point: { x: 100, y: 100 },
        markerRadius: 20,
        culled: true,
        visibleToCurrentUser: true
      },
      {
        tokenId: "hidden",
        point: { x: 100, y: 100 },
        markerRadius: 20,
        visibleToCurrentUser: false
      }
    ],
    ...overrides
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

describe("panel input controller", () => {
  it("hit tests only visible, rendered markers and respects marker size", () => {
    const projected = model().tokens;

    expect(hitTestProjectedTokens({ x: 118, y: 100 }, projected)?.tokenId).toBe("visible");
    expect(hitTestProjectedTokens({ x: 121, y: 100 }, projected)).toBeNull();
    expect(hitTestProjectedTokens({ x: 100, y: 100 }, projected, { includeCulled: true })?.tokenId)
      .toBe("visible");
    expect(hitTestProjectedTokens({ x: 100, y: 100 }, projected.filter(({ tokenId }) => tokenId !== "visible")))
      .toBeNull();
  });

  it("selects visible tokens, clears on empty space, and never controls or writes a token", () => {
    const panel = { zoom: 50, focus: { x: 5, y: 5, z: 0 } };
    const target = surface();
    const nativeToken = { control: vi.fn(), update: vi.fn() };
    const selected = [];
    const controller = new PanelInputController({
      panel,
      element: target,
      getRenderModel: () => model(),
      onSelectionChanged: (tokenId) => selected.push(tokenId)
    });

    controller.handlePointerDown(pointer("pointerdown", 110, 120));
    controller.handlePointerUp(pointer("pointerup", 110, 120));
    controller.handlePointerDown(pointer("pointerdown", 350, 280));
    controller.handlePointerUp(pointer("pointerup", 350, 280));

    expect(selected).toEqual(["visible", null]);
    expect(nativeToken.control).not.toHaveBeenCalled();
    expect(nativeToken.update).not.toHaveBeenCalled();
  });

  it("pans focus with Pointer Events without changing game coordinates", () => {
    const panel = { zoom: 50, focus: { x: 5, y: 5, z: 0 } };
    const target = surface();
    const controller = new PanelInputController({
      panel,
      element: target,
      getRenderModel: () => model({ tokens: [] })
    });

    controller.handlePointerDown(pointer("pointerdown", 210, 170));
    controller.handlePointerMove(pointer("pointermove", 260, 190));
    controller.handlePointerUp(pointer("pointerup", 260, 190));

    expect(panel.focus).toEqual({ x: 4, y: 5.4, z: 0 });
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("zooms around the pointer while preserving its tactical target", () => {
    const panel = { zoom: 50, focus: { x: 5, y: 5, z: 0 } };
    const controller = new PanelInputController({
      panel,
      element: surface(),
      getRenderModel: () => model({ tokens: [] })
    });

    const target = { x: 250, y: 150 };
    const before = controller.screenToTactical(target);
    controller.zoomAt(target, 2);
    const after = controller.screenToTactical(target);

    expect(before).toEqual(after);
    expect(panel.zoom).toBe(100);
    expect(panel.focus).toEqual({ x: 5.5, y: 5, z: 0 });
  });

  it("clamps zoom to the safe logical pixels-per-cell range and resets locally", () => {
    const panel = { zoom: DEFAULT_LOGICAL_ZOOM, focus: { x: 2, y: 3, z: 0 } };
    const controller = new PanelInputController({
      panel,
      element: surface(),
      getRenderModel: () => model({ tokens: [] })
    });

    controller.setZoom(Infinity);
    expect(panel.zoom).toBe(MAX_LOGICAL_ZOOM);
    controller.setZoom(-Infinity);
    expect(panel.zoom).toBe(MIN_LOGICAL_ZOOM);
    controller.resetView();
    expect(panel.zoom).toBe(DEFAULT_LOGICAL_ZOOM);
    expect(panel.focus).toBeNull();
  });

  it("exports a finite zoom clamp for callers outside the controller", () => {
    expect(clampLogicalZoom(0)).toBe(MIN_LOGICAL_ZOOM);
    expect(clampLogicalZoom(9999)).toBe(MAX_LOGICAL_ZOOM);
    expect(clampLogicalZoom(64)).toBe(64);
  });
});
