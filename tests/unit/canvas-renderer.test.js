import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  createNorthRenderModel,
  createSouthRenderModel,
  createTopRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { AssetManager } from "../../scripts/rendering/asset-manager.js";
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
    drawImage: vi.fn((...args) => calls.push(["drawImage", ...args])),
    translate: vi.fn((...args) => calls.push(["translate", ...args])),
    rotate: vi.fn((...args) => calls.push(["rotate", ...args])),
    scale: vi.fn((...args) => calls.push(["scale", ...args])),
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
  it("loads only visible token presets and keeps the generated marker and vector when images fail", async () => {
    const imageFactory = vi.fn(async () => {
      throw new Error("asset unavailable");
    });
    const assetManager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });
    const currentScene = scene();
    const model = createTopRenderModel({
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [
        state({ tokenId: "visible", art: { preset: "ship" } }),
        state({ tokenId: "offscreen", tacticalX: 100, tacticalY: 100, art: { preset: "object" } }),
        state({ tokenId: "hidden", visibleToCurrentUser: false, art: { preset: "creature" } })
      ],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({ assetManager }).render({
      canvas: { width: 1200, height: 800 },
      context,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(context.calls.some(([name]) => name === "arc")).toBe(true);
    expect(context.calls.some(([name]) => name === "lineTo")).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(imageFactory).toHaveBeenCalledTimes(2);
  });

  it("uses a decoded generic image on a later render without replacing the orientation vector", async () => {
    const decoded = { decode: vi.fn(async () => undefined) };
    const imageFactory = vi.fn(async () => decoded);
    const assetManager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });
    const { model } = renderInput([state({ art: { preset: "ship" } })]);
    const renderer = new Canvas2DRendererV1({ assetManager });
    const firstContext = fakeContext();
    renderer.render({
      canvas: { width: 1200, height: 800 },
      context: firstContext,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });
    await Promise.resolve();
    await Promise.resolve();
    const secondContext = fakeContext();

    renderer.render({
      canvas: { width: 1200, height: 800 },
      context: secondContext,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(secondContext.calls.some(([name]) => name === "drawImage")).toBe(true);
    expect(secondContext.calls.some(([name]) => name === "lineTo")).toBe(true);
  });

  it("uses custom art through AssetManager and applies forward offset only to drawing", () => {
    const imageSource = { source: "custom.webp" };
    const assetManager = {
      peekArt: vi.fn(() => ({
        image: imageSource,
        source: "custom.webp",
        mirrored: false,
        forwardOffset: 90
      })),
      loadArt: vi.fn()
    };
    const currentScene = scene();
    const model = createTopRenderModel({
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [state({ heading: 0, art: { icon: "custom.webp", forwardOffset: 90 } })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({ assetManager }).render({
      canvas: { width: 1200, height: 800 },
      context,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(model.tokens[0].heading).toBe(0);
    expect(assetManager.peekArt).toHaveBeenCalledWith(model.tokens[0].art, "top");
    expect(context.calls).toContainEqual(["drawImage", imageSource, -12, -12, 24, 24]);
    expect(context.calls.some(([name, value]) => name === "rotate" && value !== 0)).toBe(true);
  });

  it("requests unresolved custom art from AssetManager instead of loading a path directly", async () => {
    const assetManager = {
      peekArt: vi.fn(() => null),
      loadArt: vi.fn(async () => null)
    };
    const currentScene = scene();
    const model = createTopRenderModel({
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [state({ art: { icon: "custom.webp" } })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });

    new Canvas2DRendererV1({ assetManager }).render({
      canvas: { width: 1200, height: 800 },
      context: fakeContext(),
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model,
      invalidate: vi.fn()
    });

    expect(assetManager.loadArt).toHaveBeenCalledWith(model.tokens[0].art, "top");
    expect(assetManager.loadPreset).toBeUndefined();
  });

  it("draws opted-in mirrored artwork with a negative canvas scale", () => {
    const imageSource = { source: "north.webp" };
    const assetManager = {
      peekArt: vi.fn(() => ({
        image: imageSource,
        source: "north.webp",
        mirrored: true,
        forwardOffset: 0
      })),
      loadArt: vi.fn()
    };
    const model = createSouthRenderModel({
      scene: scene(),
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [state({ art: { views: { north: "north.webp" } } })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({ assetManager }).render({
      canvas: { width: 1200, height: 800 },
      context,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(context.calls).toContainEqual(["scale", -1, 1]);
  });

  it("builds a North X/Z model with +Z upward and explicit axis labels", () => {
    const currentScene = scene();
    const model = createNorthRenderModel({
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [state({ tacticalX: 2.5, tacticalY: 9, tacticalZ: 2 })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 0, y: 9, z: 0 }
    });

    expect(model.view).toBe("north");
    expect(model.axisLabels).toEqual({
      horizontal: "+X East",
      vertical: "+Z Up",
      hidden: "+Y South"
    });
    expect(model.tokens[0].point).toEqual({ x: 550, y: 0 });
  });

  it("renders the compact off-grid indicator in North", () => {
    const currentScene = scene();
    const model = createNorthRenderModel({
      scene: currentScene,
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [state({ tacticalZ: 1.5, offGrid: true })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1, z: 1.5 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1().render({
      canvas: { width: 1200, height: 800 },
      context,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(context.calls).toContainEqual(["fillText", "OFF GRID", 312, 244]);
  });

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

  it("groups two and three visible projected positions and exposes hidden-axis context", () => {
    const common = {
      tacticalX: 2.5,
      tacticalY: 1.5,
      tacticalZ: 0,
      width: 1,
      height: 1,
      participating: true,
      visibleToCurrentUser: true
    };
    const two = createTopRenderModel({
      scene: scene(),
      tacticalStates: [
        state({ ...common, tokenId: "upper", name: "Upper", tacticalZ: 4 }),
        state({ ...common, tokenId: "lower", name: "Lower", tacticalZ: 1 })
      ],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const three = createTopRenderModel({
      scene: scene(),
      tacticalStates: [
        state({ ...common, tokenId: "upper", tacticalZ: 4 }),
        state({ ...common, tokenId: "middle", tacticalZ: 2 }),
        state({ ...common, tokenId: "lower", tacticalZ: 1 })
      ],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });

    expect(two.stacks).toHaveLength(1);
    expect(two.stacks[0]).toMatchObject({ count: 2, hiddenAxis: "z" });
    expect(two.stacks[0].candidates.map(({ tokenId, hiddenAxisValue }) => [tokenId, hiddenAxisValue]))
      .toEqual([["lower", 1], ["upper", 4]]);
    expect(three.stacks[0].count).toBe(3);
    expect(three.tokens.every(({ stackCount }) => stackCount === 3)).toBe(true);
  });

  it("excludes invisible overlapping tokens and reflects deletion/visibility transitions", () => {
    const shared = { tacticalX: 2.5, tacticalY: 1.5, tacticalZ: 0 };
    const visible = [
      state({ tokenId: "one", ...shared }),
      state({ tokenId: "two", ...shared }),
      state({ tokenId: "hidden", ...shared, visibleToCurrentUser: false })
    ];
    const options = {
      scene: scene(),
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    };

    const before = createTopRenderModel({ ...options, tacticalStates: visible });
    const afterVisibility = createTopRenderModel({
      ...options,
      tacticalStates: visible.map((token) => token.tokenId === "two"
        ? { ...token, visibleToCurrentUser: false }
        : token)
    });
    const afterDelete = createTopRenderModel({
      ...options,
      tacticalStates: visible.filter((token) => token.tokenId !== "two")
    });

    expect(before.tokens.map(({ tokenId }) => tokenId)).toEqual(["one", "two"]);
    expect(before.stacks[0].count).toBe(2);
    expect(afterVisibility.stacks).toEqual([]);
    expect(afterDelete.stacks).toEqual([]);
  });

  it("renders a stack count and selected outline after the depth-ordered token pass", () => {
    const model = createTopRenderModel({
      scene: scene(),
      tacticalStates: [
        state({ tokenId: "near", tacticalX: 2.5, tacticalY: 1.5, tacticalZ: 0 }),
        state({ tokenId: "far", tacticalX: 2.5, tacticalY: 1.5, tacticalZ: 1 })
      ],
      selectedTokenId: "far",
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1().render({
      canvas: { width: 1200, height: 800 },
      context,
      viewport: { width: 600, height: 400 },
      devicePixelRatio: 2,
      model
    });

    expect(context.calls).toContainEqual(["fillText", "x2", 312, 188]);
    const lastSelectionDash = context.calls.findLastIndex(([name, value]) =>
      name === "setLineDash" && value?.[0] === 5
    );
    const lastTokenArc = context.calls.findLastIndex(([name]) => name === "arc");
    expect(lastSelectionDash).toBeGreaterThan(lastTokenArc - 2);
  });
});
