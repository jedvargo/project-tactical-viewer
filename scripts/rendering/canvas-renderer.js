import { orientationVector } from "../model/orientation-math.js";
import { CoordinateAdapter } from "../model/coordinate-adapter.js";
import { ProjectionEngine } from "../projection/projection-engine.js";

const DEFAULT_BACKGROUND = "#111820";
const DEFAULT_GRID = "rgba(151, 183, 204, 0.34)";
const DEFAULT_GRID_MAJOR = "rgba(206, 229, 240, 0.55)";
const DEFAULT_TOKEN = "#e6b35a";
const DEFAULT_TOKEN_STROKE = "#fff4cf";
const DEFAULT_ORIENTATION = "#ff765e";
const DEFAULT_TEXT = "#f3f5f7";

function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value, fallback) {
  const number = finiteOr(value, fallback);
  return number > 0 ? number : fallback;
}

function dimensionsOf(viewport) {
  return {
    width: Math.max(0, finiteOr(viewport?.width, 0)),
    height: Math.max(0, finiteOr(viewport?.height, 0))
  };
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function screenCenterFor(viewport, pan) {
  const { width, height } = dimensionsOf(viewport);
  return {
    x: width / 2 + finiteOr(pan?.x, 0),
    y: height / 2 + finiteOr(pan?.y, 0)
  };
}

function cameraForTop({ grid, viewport, zoom, focus, pan }) {
  const { width, height } = dimensionsOf(viewport);
  const fitScale = Math.min(
    width / Math.max(1, grid.columns),
    height / Math.max(1, grid.rows)
  );
  return {
    view: "top",
    focus: focus ?? { x: grid.columns / 2, y: grid.rows / 2, z: 0 },
    // `zoom` is the logical tactical scale: CSS pixels per tactical cell.
    // When omitted, retain the initial fit-to-panel behavior for callers that
    // have not opted into session navigation yet.
    scale: positiveOr(zoom, fitScale),
    screenCenter: screenCenterFor(viewport, pan)
  };
}

function zBounds(tacticalStates = []) {
  const levels = tacticalStates
    .map((state) => state?.tacticalZ)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const minimum = Math.min(0, ...(levels.length ? levels : [0]));
  const maximum = Math.max(0, ...(levels.length ? levels : [0]));
  return {
    min: Math.floor(minimum) - 2,
    max: Math.ceil(maximum) + 2
  };
}

function cameraForIsometric({ definition, grid, viewport, zoom, focus, pan, tacticalStates }) {
  const { width, height } = dimensionsOf(viewport);
  const bounds = zBounds(tacticalStates);
  const defaultFocus = {
    x: grid.columns / 2,
    y: grid.rows / 2,
    z: (bounds.min + bounds.max) / 2
  };
  const frame = [
    [0, 0, bounds.min],
    [grid.columns, 0, bounds.min],
    [0, grid.rows, bounds.min],
    [grid.columns, grid.rows, bounds.min],
    [0, 0, bounds.max],
    [grid.columns, 0, bounds.max],
    [0, grid.rows, bounds.max],
    [grid.columns, grid.rows, bounds.max]
  ].map(([x, y, z]) => ({
    x: x - defaultFocus.x,
    y: y - defaultFocus.y,
    z: z - defaultFocus.z
  }));
  const horizontalExtent = Math.max(
    1,
    Math.max(...frame.map((point) => point.x * definition.basis.right.x
      + point.y * definition.basis.right.y
      + point.z * definition.basis.right.z))
      - Math.min(...frame.map((point) => point.x * definition.basis.right.x
        + point.y * definition.basis.right.y
        + point.z * definition.basis.right.z))
  );
  const verticalExtent = Math.max(
    1,
    Math.max(...frame.map((point) => point.x * definition.basis.up.x
      + point.y * definition.basis.up.y
      + point.z * definition.basis.up.z))
      - Math.min(...frame.map((point) => point.x * definition.basis.up.x
        + point.y * definition.basis.up.y
        + point.z * definition.basis.up.z))
  );
  const fitScale = Math.min(width / horizontalExtent, height / verticalExtent);
  return {
    view: definition.id,
    focus: focus ?? defaultFocus,
    scale: positiveOr(zoom, fitScale),
    screenCenter: screenCenterFor(viewport, pan)
  };
}

function cameraForOrthographic({ definition, grid, viewport, zoom, focus, pan, tacticalStates }) {
  const { width, height } = dimensionsOf(viewport);
  const isTop = definition.visibleAxes.includes("y") && definition.hiddenAxis === "z";
  const horizontalAxis = definition.horizontal.axis;
  const horizontalExtent = horizontalAxis === "x" ? grid.columns : grid.rows;
  if (isTop) return cameraForTop({ grid, viewport, zoom, focus, pan });

  const bounds = zBounds(tacticalStates);
  const fitScale = Math.min(
    width / Math.max(1, horizontalExtent),
    height / Math.max(1, bounds.max - bounds.min)
  );
  const defaultFocus = {
    x: horizontalAxis === "x" ? grid.columns / 2 : 0,
    y: horizontalAxis === "y" ? grid.rows / 2 : 0,
    z: (bounds.min + bounds.max) / 2
  };
  return {
    view: definition.id,
    focus: focus ?? defaultFocus,
    scale: positiveOr(zoom, fitScale),
    screenCenter: screenCenterFor(viewport, pan)
  };
}

function projectedGrid({ grid, camera, projectionEngine }) {
  const verticalLines = grid.verticalLines.map((line) => ({
    start: projectionEngine.projectPoint({ x: line.x, y: line.fromY, z: 0 }, camera),
    end: projectionEngine.projectPoint({ x: line.x, y: line.toY, z: 0 }, camera),
    major: line.x === 0 || line.x === grid.columns
  }));
  const horizontalLines = grid.horizontalLines.map((line) => ({
    start: projectionEngine.projectPoint({ x: line.fromX, y: line.y, z: 0 }, camera),
    end: projectionEngine.projectPoint({ x: line.toX, y: line.y, z: 0 }, camera),
    major: line.y === 0 || line.y === grid.rows
  }));
  return Object.freeze({
    columns: grid.columns,
    rows: grid.rows,
    verticalLines: Object.freeze(verticalLines),
    horizontalLines: Object.freeze(horizontalLines)
  });
}

function projectedVerticalGrid({ grid, camera, projectionEngine, zRange, definition }) {
  const horizontalAxis = definition.horizontal.axis;
  const extent = horizontalAxis === "x" ? grid.columns : grid.rows;
  const pointAt = (horizontal, z) => ({
    x: horizontalAxis === "x" ? horizontal : 0,
    y: horizontalAxis === "y" ? horizontal : 0,
    z
  });
  const verticalLines = Array.from({ length: extent + 1 }, (_, index) => ({
    start: projectionEngine.projectPoint(pointAt(index, zRange.min), camera),
    end: projectionEngine.projectPoint(pointAt(index, zRange.max), camera),
    major: index === 0 || index === extent
  }));
  const horizontalLines = Array.from(
    { length: zRange.max - zRange.min + 1 },
    (_, index) => {
      const z = zRange.min + index;
      return {
        start: projectionEngine.projectPoint(pointAt(0, z), camera),
        end: projectionEngine.projectPoint(pointAt(extent, z), camera),
        major: z === 0
      };
    }
  );
  return Object.freeze({
    columns: extent,
    rows: zRange.max - zRange.min,
    zMin: zRange.min,
    zMax: zRange.max,
    verticalLines: Object.freeze(verticalLines),
    horizontalLines: Object.freeze(horizontalLines)
  });
}

function projectedIsometricGrid({ grid, camera, projectionEngine, zRange }) {
  const lines = [];
  const addLine = (axis, start, end, major = false) => {
    lines.push({
      axis,
      start: projectionEngine.projectPoint(start, camera),
      end: projectionEngine.projectPoint(end, camera),
      major
    });
  };

  for (let z = zRange.min; z <= zRange.max; z += 1) {
    for (let y = 0; y <= grid.rows; y += 1) {
      addLine("x", { x: 0, y, z }, { x: grid.columns, y, z }, y === 0 || y === grid.rows);
    }
    for (let x = 0; x <= grid.columns; x += 1) {
      addLine("y", { x, y: 0, z }, { x, y: grid.rows, z }, x === 0 || x === grid.columns);
    }
  }
  for (let x = 0; x <= grid.columns; x += 1) {
    for (let y = 0; y <= grid.rows; y += 1) {
      addLine("z", { x, y, z: zRange.min }, { x, y, z: zRange.max },
        x === 0 || x === grid.columns || y === 0 || y === grid.rows);
    }
  }

  return Object.freeze({
    columns: grid.columns,
    rows: grid.rows,
    zMin: zRange.min,
    zMax: zRange.max,
    lines: Object.freeze(lines)
  });
}

function staticKey(model, width, height, dpr) {
  return [
    model.sceneId,
    model.view,
    model.camera.scale,
    model.camera.focus.x,
    model.camera.focus.y,
    model.camera.focus.z,
    model.camera.screenCenter.x,
    model.camera.screenCenter.y,
    width,
    height,
    dpr,
    model.overlays.grid
  ].join(":");
}

function visibleToken(state, projectionEngine, camera, viewport) {
  if (!state || state.visibleToCurrentUser !== true || state.participating !== true) return null;
  const point = projectionEngine.projectPoint({
    x: state.tacticalX,
    y: state.tacticalY,
    z: state.tacticalZ
  }, camera);
  const markerRadius = Math.max(
    4,
    Math.min(positiveOr(state.width, 1), positiveOr(state.height, 1)) * camera.scale * 0.12
  );
  const { width, height } = dimensionsOf(viewport);
  if (point.x + markerRadius < 0 || point.x - markerRadius > width
    || point.y + markerRadius < 0 || point.y - markerRadius > height) return null;

  const orientation = projectionEngine.projectOrientationVector(
    orientationVector(state.heading, state.pitch),
    { ...camera, scale: camera.scale * 0.5 }
  );
  return Object.freeze({
    tokenId: state.tokenId,
    visibleToCurrentUser: true,
    name: typeof state.name === "string" ? state.name : "",
    tacticalX: state.tacticalX,
    tacticalY: state.tacticalY,
    tacticalZ: state.tacticalZ,
    elevation: state.elevation,
    width: state.width,
    height: state.height,
    heading: state.heading,
    pitch: state.pitch,
    canCurrentUserMove: state.canCurrentUserMove === true,
    canCurrentUserRotate: state.canCurrentUserRotate === true,
    locked: state.locked === true,
    lockRotation: state.lockRotation === true,
    preview: state.preview === true,
    offGrid: state.offGrid === true,
    point,
    orientation,
    markerRadius
  });
}

/**
 * Build the read-only render model for an orthographic panel. The only token input is
 * already visibility-filtered TacticalTokenState data; TokenDocuments never
 * cross this boundary.
 */
function createOrthographicRenderModel({
  view,
  scene,
  coordinateAdapter = new CoordinateAdapter(),
  projectionEngine = new ProjectionEngine(),
  tacticalStates = [],
  viewport,
  zoom,
  focus,
  pan,
  overlays = {},
  selectedTokenId = null,
  movementPreview = null
} = {}) {
  const gridGeometry = coordinateAdapter.getTopGrid(scene);
  const definition = projectionEngine.describe(view);
  const camera = definition.basis
    ? cameraForIsometric({
      definition,
      grid: gridGeometry,
      viewport,
      zoom,
      focus,
      pan,
      tacticalStates
    })
    : cameraForOrthographic({
      definition,
      grid: gridGeometry,
      viewport,
      zoom,
      focus,
      pan,
      tacticalStates
    });
  const grid = definition.basis
    ? projectedIsometricGrid({
      grid: gridGeometry,
      camera,
      projectionEngine,
      zRange: zBounds(tacticalStates)
    })
    : definition.visibleAxes.includes("z")
    ? projectedVerticalGrid({
      grid: gridGeometry,
      camera,
      projectionEngine,
      zRange: zBounds(tacticalStates),
      definition
    })
    : projectedGrid({ grid: gridGeometry, camera, projectionEngine });
  const tokens = Object.freeze(
    (Array.isArray(tacticalStates) ? tacticalStates : [])
      .map((state) => movementPreview?.tokenId === state?.tokenId
        ? { ...state, ...movementPreview, preview: true }
        : state)
      .map((state) => visibleToken(state, projectionEngine, camera, viewport))
      .filter(Boolean)
      .map((state) => Object.freeze({
        ...state,
        selected: selectedTokenId !== null && state.tokenId === selectedTokenId
      }))
  );
  return Object.freeze({
    sceneId: scene?.id,
    view,
    camera: Object.freeze(camera),
    grid,
    tokens,
    movementPreview,
    selectedTokenId,
    axisLabels: projectionEngine.describe(view).labels,
    overlays: Object.freeze({
      grid: overlays.grid !== false,
      names: overlays.names !== false,
      elevation: overlays.elevation !== false,
      heading: overlays.heading !== false,
      pitch: overlays.pitch !== false
    })
  });
}

export function createTopRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "top" });
}

export function createNorthRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "north" });
}

export function createSouthRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "south" });
}

export function createEastRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "east" });
}

export function createWestRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "west" });
}

export function createIsometricRenderModel(options = {}) {
  const view = options.view ?? "iso-ne";
  if (!view.startsWith("iso-")) {
    throw new RangeError("An isometric view ID is required");
  }
  return createOrthographicRenderModel({ ...options, view });
}

export function createIsoNeRenderModel(options = {}) {
  return createIsometricRenderModel({ ...options, view: "iso-ne" });
}

export function createIsoSeRenderModel(options = {}) {
  return createIsometricRenderModel({ ...options, view: "iso-se" });
}

export function createIsoSwRenderModel(options = {}) {
  return createIsometricRenderModel({ ...options, view: "iso-sw" });
}

export function createIsoNwRenderModel(options = {}) {
  return createIsometricRenderModel({ ...options, view: "iso-nw" });
}

export const RENDERABLE_ORTHOGRAPHIC_VIEW_IDS = Object.freeze([
  "top", "north", "south", "east", "west"
]);

export const RENDERABLE_VIEW_IDS = Object.freeze([
  ...RENDERABLE_ORTHOGRAPHIC_VIEW_IDS,
  "iso-ne", "iso-se", "iso-sw", "iso-nw"
]);

export function isRenderableOrthographicView(view) {
  return RENDERABLE_ORTHOGRAPHIC_VIEW_IDS.includes(view);
}

export function isRenderableView(view) {
  return RENDERABLE_VIEW_IDS.includes(view);
}

/** Interface boundary for replaceable tactical Canvas2D renderers. */
export class Canvas2DRenderer {
  render() {
    throw new Error("Canvas2DRenderer.render() must be implemented by a concrete renderer");
  }
}

function drawLine(context, start, end) {
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
}

function drawArrowHead(context, point, vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-9) return;
  const ux = vector.x / length;
  const uy = vector.y / length;
  const size = Math.min(8, Math.max(4, length * 0.2));
  const left = {
    x: point.x - ux * size - uy * size * 0.55,
    y: point.y - uy * size + ux * size * 0.55
  };
  const right = {
    x: point.x - ux * size + uy * size * 0.55,
    y: point.y - uy * size - ux * size * 0.55
  };
  context.moveTo(left.x, left.y);
  context.lineTo(point.x, point.y);
  context.lineTo(right.x, right.y);
}

/** Concrete read-only schematic renderer for all fixed tactical views. */
export class Canvas2DRendererV1 extends Canvas2DRenderer {
  constructor({
    coordinateAdapter = new CoordinateAdapter(),
    projectionEngine = new ProjectionEngine(),
    colors = {}
  } = {}) {
    super();
    this.coordinateAdapter = coordinateAdapter;
    this.projectionEngine = projectionEngine;
    this.colors = { ...colors };
    this.staticGridCache = undefined;
  }

  buildModel(input) {
    const panel = input?.panel ?? input?.state?.panels?.[input?.panelIndex ?? 0] ?? {};
    const modelOptions = {
      scene: input.scene,
      coordinateAdapter: this.coordinateAdapter,
      projectionEngine: this.projectionEngine,
      tacticalStates: input.visibleTacticalStates,
      viewport: input.viewport,
      zoom: panel.zoom,
      focus: panel.focus,
      pan: panel.pan,
      overlays: panel.overlays,
      selectedTokenId: input?.selectedTokenId ?? input?.state?.selectedTokenId,
      movementPreview: input?.state?.movementPreview
    };
    if (!isRenderableView(panel.view)) return createTopRenderModel(modelOptions);
    return createOrthographicRenderModel({ ...modelOptions, view: panel.view });
  }

  drawStatic(context, model, width, height, dpr = 1, transform = true) {
    if (transform) {
      context.save?.();
      context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    }
    context.fillStyle = this.colors.background ?? DEFAULT_BACKGROUND;
    context.fillRect?.(0, 0, width, height);
    if (model.overlays.grid) {
      context.lineWidth = 1;
      const lines = model.grid.lines
        ?? [...model.grid.verticalLines, ...model.grid.horizontalLines];
      for (const line of lines) {
        context.beginPath?.();
        context.strokeStyle = line.major
          ? this.colors.gridMajor ?? DEFAULT_GRID_MAJOR
          : this.colors.grid ?? DEFAULT_GRID;
        drawLine(context, line.start, line.end);
        context.stroke?.();
      }
    }
    if (model.axisLabels) {
      context.fillStyle = this.colors.text ?? DEFAULT_TEXT;
      context.font = "12px sans-serif";
      context.fillText?.(model.axisLabels.horizontal, 8, Math.max(14, height - 8));
      context.fillText?.(model.axisLabels.vertical, 8, 14);
      const depthLabel = model.axisLabels.hidden ?? model.axisLabels.depth ?? "";
      context.fillText?.(`Hidden: ${depthLabel}`, Math.max(8, width - 132), 14);
    }
    if (transform) context.restore?.();
  }

  getStaticLayer(model, canvas, width, height, dpr) {
    const key = staticKey(model, width, height, dpr);
    if (this.staticGridCache?.key === key) return this.staticGridCache.surface;

    const document = canvas?.ownerDocument;
    const surface = typeof globalThis?.OffscreenCanvas === "function"
      ? new globalThis.OffscreenCanvas(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)))
      : document?.createElement?.("canvas");
    if (!surface?.getContext) {
      this.staticGridCache = { key, surface: null };
      return null;
    }
    surface.width = Math.max(1, Math.round(width * dpr));
    surface.height = Math.max(1, Math.round(height * dpr));
    const staticContext = surface.getContext("2d");
    if (!staticContext) return null;
    this.drawStatic(staticContext, model, width, height, dpr);
    this.staticGridCache = { key, surface };
    return surface;
  }

  render(input = {}) {
    const context = input.context;
    if (!context) return false;
    const model = input.model ?? this.buildModel(input);
    const { width, height } = dimensionsOf(input.viewport);
    const dpr = positiveOr(input.devicePixelRatio,
      width > 0 ? (input.canvas?.width ?? width) / width : 1);

    context.save?.();
    context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    const staticSurface = this.getStaticLayer(model, input.canvas, width, height, dpr);
    if (staticSurface && typeof context.drawImage === "function") {
      context.drawImage(staticSurface, 0, 0, width, height);
    } else {
      this.drawStatic(context, model, width, height, dpr, false);
    }

    for (const token of model.tokens) {
      const { point, markerRadius, orientation } = token;
      context.beginPath?.();
      context.fillStyle = this.colors.token ?? DEFAULT_TOKEN;
      context.arc?.(point.x, point.y, markerRadius, 0, Math.PI * 2);
      context.fill?.();
      context.strokeStyle = this.colors.tokenStroke ?? DEFAULT_TOKEN_STROKE;
      context.stroke?.();

      if (token.preview) {
        context.beginPath?.();
        context.strokeStyle = this.colors.preview ?? "#8bd8ff";
        context.setLineDash?.([6, 4]);
        context.arc?.(point.x, point.y, markerRadius + 6, 0, Math.PI * 2);
        context.stroke?.();
        context.setLineDash?.([]);
      }

      if (token.selected) {
        context.beginPath?.();
        context.strokeStyle = this.colors.selection ?? "#ffffff";
        context.setLineDash?.([5, 3]);
        context.arc?.(point.x, point.y, markerRadius + 4, 0, Math.PI * 2);
        context.stroke?.();
        context.setLineDash?.([]);
      }

      if (model.overlays.heading || model.overlays.pitch) {
        const tip = { x: point.x + orientation.x, y: point.y + orientation.y };
        context.beginPath?.();
        context.strokeStyle = this.colors.orientation ?? DEFAULT_ORIENTATION;
        context.lineWidth = 2;
        drawLine(context, point, tip);
        drawArrowHead(context, tip, orientation);
        context.stroke?.();
      }

      context.fillStyle = this.colors.text ?? DEFAULT_TEXT;
      context.font = "12px sans-serif";
      const labelX = point.x + markerRadius;
      const labelY = point.y - markerRadius;
      if (model.overlays.names && token.name) context.fillText?.(token.name, labelX, labelY);
      if (model.overlays.elevation) {
        context.fillText?.(`Z ${formatSigned(token.tacticalZ)}`, labelX, labelY + 14);
      }
      if (model.overlays.heading) {
        context.fillText?.(`H ${String(token.heading).padStart(3, "0")}°`, labelX, labelY + 28);
      }
      if (model.overlays.pitch) {
        context.fillText?.(`P ${formatSigned(token.pitch)}°`, labelX, labelY + 42);
      }
      if (token.offGrid) context.fillText?.("OFF GRID", labelX, labelY + 56);
    }

    context.restore?.();
    return true;
  }
}

export const TacticalCanvasRenderer = Canvas2DRendererV1;
export const createCanvas2DRenderer = (options) => new Canvas2DRendererV1(options);
