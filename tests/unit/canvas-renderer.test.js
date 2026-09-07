import { describe, expect, it, vi } from "vitest";

import {
  Canvas2DRendererV1,
  DEFAULT_GRID_MARGIN,
  createBottomRenderModel,
  createIsometricRenderModel,
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
    closePath: vi.fn(() => calls.push(["closePath"])),
    stroke: vi.fn(() => calls.push(["stroke"])),
    arc: vi.fn((...args) => calls.push(["arc", ...args])),
    clip: vi.fn(() => calls.push(["clip"])),
    drawImage: vi.fn((...args) => calls.push(["drawImage", ...args])),
    translate: vi.fn((...args) => calls.push(["translate", ...args])),
    transform: vi.fn((...args) => calls.push(["transform", ...args])),
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
  it("fits an initial grid inside the viewport with the default outer margin", () => {
    const model = createTopRenderModel({
      scene: scene(),
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      viewport: { width: 600, height: 400 }
    });

    expect(DEFAULT_GRID_MARGIN).toBe(24);
    expect(model.camera.scale).toBe(88);
    expect(model.grid.verticalLines[0].start).toEqual({ x: 36, y: 376 });
    expect(model.grid.horizontalLines[0].start).toEqual({ x: 36, y: 376 });
  });

  it("supports custom grid dimensions and opacity in every projection", () => {
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      tacticalStates: [],
      viewport: { width: 600, height: 400 },
      zoom: 20,
      focus: { x: 1.5, y: 1, z: 0 },
      gridDimensions: { columns: 3, rows: 2 },
      overlays: { gridOpacity: 0.25 }
    });

    expect(model.grid.columns).toBe(3);
    expect(model.grid.rows).toBe(2);
    expect(model.overlays.gridOpacity).toBe(0.25);
    expect(model.grid.lines.length).toBeGreaterThan(0);
  });

  it("keeps the configured Z grid size when a token is above its bounds", () => {
    const model = createNorthRenderModel({
      scene: scene(),
      tacticalStates: [state({ tacticalZ: 30 })],
      viewport: { width: 600, height: 400 },
      zoom: 20,
      focus: { x: 1.5, y: 1, z: 2.5 },
      gridDimensions: { x: 3, y: 2, z: 5 }
    });

    expect(model.grid.zMin).toBe(0);
    expect(model.grid.zMax).toBe(5);
    expect(model.grid.horizontalLines).toHaveLength(6);
  });

  it("draws the configured tactical icon in an isometric panel", () => {
    const image = { source: "ship.webp" };
    const assetManager = {
      peekArt: vi.fn(() => ({ image, mirrored: false, forwardOffset: 0 })),
      loadArt: vi.fn()
    };
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      tacticalStates: [state({ art: { icon: "ship.webp" } })],
      viewport: { width: 600, height: 400 },
      zoom: 40,
      focus: { x: 2.5, y: 1.5, z: 2.5 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({ assetManager }).render({
      canvas: { width: 600, height: 400 },
      context,
      viewport: { width: 600, height: 400 },
      model
    });

    expect(assetManager.peekArt).toHaveBeenCalledWith(model.tokens[0].art, "iso-ne");
    expect(context.calls.some(([name, value]) => name === "drawImage" && value === image)).toBe(true);
  });

  it("renders an isometric token with art on the front face, rotated by heading and pitch", () => {
    const image = { source: "ship.webp" };
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      tacticalStates: [state({
        width: 2,
        height: 1,
        depth: 3,
        heading: 90,
        pitch: 0,
        art: { icon: "ship.webp" }
      })],
      viewport: { width: 600, height: 400 },
      zoom: 40,
      focus: { x: 2.5, y: 1.5, z: 3.5 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({
      assetManager: { peekArt: () => ({ image, mirrored: false }), loadArt: vi.fn() }
    }).render({
      canvas: { width: 600, height: 400 },
      context,
      viewport: { width: 600, height: 400 },
      model
    });

    expect(model.tokens[0]).toMatchObject({ isometric: true, width: 2, height: 1, depth: 3 });
    expect(context.calls.filter(([name]) => name === "fill")).toHaveLength(3);
    expect(context.calls.filter(([name]) => name === "transform")).toHaveLength(1);
    const imageTransform = context.calls.find(([name]) => name === "transform");
    expect(imageTransform[5]).toBeCloseTo(260, 0);
    expect(imageTransform[6]).toBeCloseTo(144, 0);
    expect(context.calls).toContainEqual(["rotate", Math.PI / 2]);
    expect(context.calls).toContainEqual(["drawImage", image, 0, 0, 1, 1]);
  });

  it.each([
    ["dashes", [8, 6]],
    ["dots", [1, 5]]
  ])("applies the %s pattern to every isometric grid line", (gridStyle, pattern) => {
    const model = createIsometricRenderModel({
      view: "iso-ne",
      scene: scene(),
      overlays: { gridStyle },
      viewport: { width: 600, height: 400 },
      zoom: 20,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1().render({
      canvas: { width: 600, height: 400 },
      context,
      viewport: { width: 600, height: 400 },
      model
    });

    const patternedLines = context.calls.filter(([name, value]) =>
      name === "setLineDash" && JSON.stringify(value) === JSON.stringify(pattern)
    );
    expect(patternedLines).toHaveLength(model.grid.lines.length);
  });

  it("renders a rectangular token footprint across the grid", () => {
    const image = { source: "ship.webp" };
    const model = createTopRenderModel({
      scene: scene(),
      tacticalStates: [state({ width: 2, height: 1, art: { icon: "ship.webp" } })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });
    const context = fakeContext();

    new Canvas2DRendererV1({
      assetManager: { peekArt: () => ({ image, mirrored: false }), loadArt: vi.fn() }
    }).render({
      canvas: { width: 600, height: 400 },
      context,
      viewport: { width: 600, height: 400 },
      model
    });

    expect(model.tokens[0]).toMatchObject({
      width: 2,
      height: 1,
      footprintWidth: 200,
      footprintHeight: 100,
      multiCell: true
    });
    expect(context.calls).toContainEqual(["drawImage", image, -100, -50, 200, 100]);
  });

  it("renders a depth-only token footprint in vertical views", () => {
    const model = createNorthRenderModel({
      scene: scene(),
      tacticalStates: [state({ depth: 3 })],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 1.5, z: 0 }
    });

    expect(model.tokens[0]).toMatchObject({
      width: 1,
      height: 1,
      depth: 3,
      footprintWidth: 100,
      footprintHeight: 300,
      multiCell: true
    });
  });

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
    expect(context.calls).toContainEqual(["drawImage", imageSource, -50, -50, 100, 100]);
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
      focus: { x: 2.5, y: 1.5, z: 2.5 }
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
      focus: { x: 0, y: 9, z: 2.5 }
    });

    expect(model.view).toBe("north");
    expect(model.axisLabels).toEqual({
      horizontal: "+X East",
      vertical: "+Z Up",
      hidden: "+Y South"
    });
    expect(model.tokens[0].point).toEqual({ x: 550, y: 200 });
  });

  it("keeps Bottom as an XY projection instead of falling back to Top", () => {
    const model = createBottomRenderModel({
      scene: scene(),
      coordinateAdapter: new CoordinateAdapter(),
      projectionEngine: new ProjectionEngine(),
      tacticalStates: [],
      viewport: { width: 600, height: 400 },
      zoom: 100,
      focus: { x: 2.5, y: 2.5, z: 1 }
    });

    expect(model.view).toBe("bottom");
    expect(model.camera.view).toBe("bottom");
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

    expect(context.calls).toContainEqual(["fillText", "OFF GRID", 350, 156]);
  });

  it("draws the projected Top grid, token center, orientation vector, and labels", () => {
    const { context, model } = renderInput([state()], { selectedTokenId: "token-1" });
    const token = model.tokens[0];

    expect(model.grid.verticalLines.length).toBe(7);
    expect(model.grid.horizontalLines.length).toBe(5);
    expect(token.point).toEqual({ x: 256, y: 244 });
    expect(token.orientation).toEqual({ x: 0, y: 31.112698372208094 });
    expect(context.setTransform).toHaveBeenCalledTimes(1);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.calls.some(([name]) => name === "stroke")).toBe(true);
    expect(context.calls).toContainEqual(["arc", 256, 244, 44, 0, 6.283185307179586]);
    expect(context.calls).toContainEqual(["fillText", "Aurora", 300, 200]);
    expect(context.calls.some(([name, value]) => name === "fillText" && value === "P +45°")).toBe(true);
    expect(context.calls).toContainEqual(["setLineDash", [5, 3]]);
  });

  it("snaps displayed headings without changing the projected orientation", () => {
    const { context, model } = renderInput([state({ heading: 12.6 })]);

    expect(model.tokens[0].heading).toBe(12.6);
    expect(context.calls.some(([name, value]) => name === "fillText" && value === "H 000°")).toBe(true);
  });

  it("draws axis labels only when debug axes are enabled", () => {
    const hidden = renderInput([state()]);
    const shown = renderInput([state()], { overlays: { debugAxes: true } });

    expect(hidden.context.calls.some(([name, value]) => name === "fillText" && value === "+X East")).toBe(false);
    expect(shown.context.calls.some(([name, value]) => name === "fillText" && value === "+X East")).toBe(true);
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

    expect(model.tokens[0].point).toEqual({ x: 344, y: 156 });
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
      point: { x: 344, y: 156 },
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

    expect(context.calls).toContainEqual(["fillText", "x2", 350, 150]);
    const lastSelectionDash = context.calls.findLastIndex(([name, value]) =>
      name === "setLineDash" && value?.[0] === 5
    );
    const lastTokenArc = context.calls.findLastIndex(([name]) => name === "arc");
    expect(lastSelectionDash).toBeGreaterThan(lastTokenArc - 2);
  });
});
