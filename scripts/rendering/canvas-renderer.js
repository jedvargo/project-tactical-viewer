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

function cameraForTop({ grid, viewport, zoom, focus }) {
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
    screenCenter: { x: width / 2, y: height / 2 }
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

function staticKey(model, width, height, dpr) {
  return [
    model.sceneId,
    model.view,
    model.camera.scale,
    model.camera.focus.x,
    model.camera.focus.y,
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
 * Build the read-only render model for a Top panel. The only token input is
 * already visibility-filtered TacticalTokenState data; TokenDocuments never
 * cross this boundary.
 */
export function createTopRenderModel({
  scene,
  coordinateAdapter = new CoordinateAdapter(),
  projectionEngine = new ProjectionEngine(),
  tacticalStates = [],
  viewport,
  zoom,
  focus,
  overlays = {},
  selectedTokenId = null,
  movementPreview = null
} = {}) {
  const gridGeometry = coordinateAdapter.getTopGrid(scene);
  const camera = cameraForTop({ grid: gridGeometry, viewport, zoom, focus });
  const grid = projectedGrid({ grid: gridGeometry, camera, projectionEngine });
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
    view: "top",
    camera: Object.freeze(camera),
    grid,
    tokens,
    movementPreview,
    selectedTokenId,
    overlays: Object.freeze({
      grid: overlays.grid !== false,
      names: overlays.names !== false,
      elevation: overlays.elevation !== false,
      heading: overlays.heading !== false,
      pitch: overlays.pitch !== false
    })
  });
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

/** Concrete read-only schematic renderer for the v1 Top projection. */
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
    const panel = input?.state?.panels?.[0] ?? {};
    return createTopRenderModel({
      scene: input.scene,
      coordinateAdapter: this.coordinateAdapter,
      projectionEngine: this.projectionEngine,
      tacticalStates: input.visibleTacticalStates,
      viewport: input.viewport,
      zoom: panel.zoom,
      focus: panel.focus,
      overlays: panel.overlays,
      selectedTokenId: input?.state?.selectedTokenId,
      movementPreview: input?.state?.movementPreview
    });
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
      for (const line of [...model.grid.verticalLines, ...model.grid.horizontalLines]) {
        context.beginPath?.();
        context.strokeStyle = line.major
          ? this.colors.gridMajor ?? DEFAULT_GRID_MAJOR
          : this.colors.grid ?? DEFAULT_GRID;
        drawLine(context, line.start, line.end);
        context.stroke?.();
      }
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
