import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  createTopRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { ProjectionEngine } from "../../scripts/projection/projection-engine.js";
import { createFakeSquareGrid } from "../helpers/fake-grid.js";

function fakeContext() {
  const calls = [];
  const context = {
    calls,
    save: vi.fn(() => calls.push(["save"])),
    restore: vi.fn(() => calls.push(["restore"])),
    setTransform: vi.fn((...args) => calls.push(["setTransform", ...args])),
    clearRect: vi.fn((...args) => calls.push(["clearRect", ...args])),
    fillRect: vi.fn((...args) => calls.push(["fillRect", ...args])),
    beginPath: vi.fn(() => calls.push(["beginPath"])),
    moveTo: vi.fn((...args) => calls.push(["moveTo", ...args])),
    lineTo: vi.fn((...args) => calls.push(["lineTo", ...args])),
    stroke: vi.fn(() => calls.push(["stroke"])),
    arc: vi.fn((...args) => calls.push(["arc", ...args])),
    fill: vi.fn(() => calls.push(["fill"])),
    fillText: vi.fn((...args) => calls.push(["fillText", ...args])),
    setLineDash: vi.fn((...args) => calls.push(["setLineDash", ...args]))
  };
  return context;
}

function scene() {
  const grid = createFakeSquareGrid({ size: 100, distance: 5 });
  return {
    id: "scene-1",
    grid,
    dimensions: { width: 600, height: 400 }
  };
}

function state(overrides = {}) {
  return {
    tokenId: "token-1",
    name: "Aurora",
    tacticalX: 2.5,
    tacticalY: 1.5,
    tacticalZ: 2,
    elevation: 10,
    width: 1,
    height: 1,
    heading: 0,
    pitch: 45,
    participating: true,
    visibleToCurrentUser: true,
    ...overrides
  };
}

function renderInput(states, overrides = {}) {
  const currentScene = scene();
  const model = createTopRenderModel({
    scene: currentScene,
    coordinateAdapter: new CoordinateAdapter(),
    projectionEngine: new ProjectionEngine(),
    tacticalStates: states,
    viewport: { width: 600, height: 400 },
    ...overrides
  });
  const context = fakeContext();
  const renderer = new Canvas2DRendererV1();
  renderer.render({
    canvas: { width: 1200, height: 800 },
    context,
    viewport: { width: 600, height: 400 },
    devicePixelRatio: 2,
    model
  });
  return { context, model };
}

describe("Canvas2DRendererV1", () => {
  it("draws the projected Top grid, token center, orientation vector, and labels", () => {
    const { context, model } = renderInput([state()], { selectedTokenId: "token-1" });
    const token = model.tokens[0];

    expect(model.grid.verticalLines.length).toBe(7);
    expect(model.grid.horizontalLines.length).toBe(5);
    expect(token.point).toEqual({ x: 250, y: 250 });
    expect(token.orientation).toEqual({ x: 0, y: 35.35533905932738 });
    expect(context.setTransform).toHaveBeenCalledTimes(1);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.calls.some(([name]) => name === "stroke")).toBe(true);
    expect(context.calls).toContainEqual(["arc", 250, 250, 12, 0, 6.283185307179586]);
    expect(context.calls).toContainEqual(["fillText", "Aurora", 262, 238]);
    expect(context.calls.some(([name, value]) => name === "fillText" && value === "P +45°")).toBe(true);
    expect(context.calls).toContainEqual(["setLineDash", [5, 3]]);
  });

  it("culls an offscreen token and never draws an invisible token", () => {
    const { context, model } = renderInput([
      state({ tokenId: "visible", tacticalX: 2.5, tacticalY: 1.5 }),
      state({ tokenId: "offscreen", tacticalX: 100, tacticalY: 100 }),
      state({ tokenId: "hidden", visibleToCurrentUser: false })
    ]);

    expect(model.tokens.map(({ tokenId }) => tokenId)).toEqual(["visible"]);
    expect(context.calls.filter(([name]) => name === "arc")).toHaveLength(1);
  });

  it("keeps a multi-cell token marker at its derived tactical center", () => {
    const { model } = renderInput([state({
      tokenId: "large",
      tacticalX: 3.5,
      tacticalY: 2.5,
      width: 2,
      height: 2
    })]);

    expect(model.tokens[0].point).toEqual({ x: 350, y: 150 });
  });

  it("renders a local XY preview at the candidate anchor while preserving Z", () => {
    const { model } = renderInput([state({ tacticalZ: 7 })], {
      movementPreview: {
        tokenId: "token-1",
        tacticalX: 3.5,
        tacticalY: 2.5,
        tacticalZ: 7,
        delta: { x: 1, y: 1 },
        preview: true
      }
    });

    expect(model.tokens[0]).toMatchObject({
      point: { x: 350, y: 150 },
      tacticalX: 3.5,
      tacticalY: 2.5,
      tacticalZ: 7,
      preview: true
    });
  });

  it("does not update a document while rendering", () => {
    const tokenDocument = { update: vi.fn() };
    renderInput([state({ document: tokenDocument })]);
    expect(tokenDocument.update).not.toHaveBeenCalled();
  });
});
