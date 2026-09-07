import { orientationVector, snapHeading } from "../model/orientation-math.js";
import { CoordinateAdapter } from "../model/coordinate-adapter.js";
import { ProjectionEngine } from "../projection/projection-engine.js";
import {
  AssetManager,
  getTacticalArtCandidates
} from "./asset-manager.js";
import { localize, localizeFormat } from "../i18n.js";

const DEFAULT_BACKGROUND = "#111820";
const DEFAULT_GRID = "rgba(151, 183, 204, 0.34)";
const DEFAULT_GRID_MAJOR = "rgba(206, 229, 240, 0.55)";
const GRID_LINE_STYLES = new Set(["solid", "dashes", "dots"]);
const DEFAULT_TOKEN = "#e6b35a";
const DEFAULT_TOKEN_STROKE = "#fff4cf";
const DEFAULT_ISOMETRIC_TOP = "#e6b35a";
const DEFAULT_ISOMETRIC_X_FACE = "#c78f3f";
const DEFAULT_ISOMETRIC_Y_FACE = "#9d6c35";
const DEFAULT_ISOMETRIC_EDGE = "#fff4cf";
const DEFAULT_ORIENTATION = "#ff765e";
const DEFAULT_TEXT = "#f3f5f7";
export const DEFAULT_GRID_MARGIN = 24;
const ISOMETRIC_TOKEN_INSET = 0.08;
const ZERO_Z_RANGE = Object.freeze({ min: 0, max: 0 });

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

function tokenDimensions(state) {
  return {
    width: Math.max(1, positiveOr(state?.width, 1)),
    height: Math.max(1, positiveOr(state?.height, 1)),
    depth: Math.max(1, positiveOr(state?.depth, 1))
  };
}

function projectedFootprint({ state, projectionEngine, camera, definition, worldPoint }) {
  const { width, height, depth } = tokenDimensions(state);
  const baseSize = Math.max(8, camera.scale * 0.24);

  if (definition.basis) {
    const corners = [
      { x: worldPoint.x - width / 2, y: worldPoint.y - height / 2, z: worldPoint.z - depth / 2 },
      { x: worldPoint.x + width / 2, y: worldPoint.y - height / 2, z: worldPoint.z - depth / 2 },
      { x: worldPoint.x - width / 2, y: worldPoint.y + height / 2, z: worldPoint.z - depth / 2 },
      { x: worldPoint.x + width / 2, y: worldPoint.y + height / 2, z: worldPoint.z - depth / 2 },
      { x: worldPoint.x - width / 2, y: worldPoint.y - height / 2, z: worldPoint.z + depth / 2 },
      { x: worldPoint.x + width / 2, y: worldPoint.y - height / 2, z: worldPoint.z + depth / 2 },
      { x: worldPoint.x - width / 2, y: worldPoint.y + height / 2, z: worldPoint.z + depth / 2 },
      { x: worldPoint.x + width / 2, y: worldPoint.y + height / 2, z: worldPoint.z + depth / 2 }
    ].map((corner) => projectionEngine.projectPoint(corner, camera));
    return {
      width: Math.max(baseSize, Math.max(...corners.map(({ x }) => x)) - Math.min(...corners.map(({ x }) => x))),
      height: Math.max(baseSize, Math.max(...corners.map(({ y }) => y)) - Math.min(...corners.map(({ y }) => y)))
    };
  }

  const isTop = definition.visibleAxes.includes("x") && definition.visibleAxes.includes("y");
  if (isTop) {
    return {
      width: Math.max(baseSize, width * camera.scale),
      height: Math.max(baseSize, height * camera.scale)
    };
  }

  const horizontalCells = definition.horizontal.axis === "x" ? width : height;
  return {
    width: Math.max(baseSize, horizontalCells * camera.scale),
    height: Math.max(baseSize, depth * camera.scale)
  };
}

function isometricView(view) {
  return view === "isometric" || (typeof view === "string" && view.startsWith("iso-"));
}

/**
 * Return the rotation of a forward-facing image in the visible Y face.
 * The image's unrotated nose points toward +Z. Front-view projection hides Y,
 * so heading contributes its X component and pitch contributes its Z
 * component. The projected orientation vector remains the complete 3D
 * authority and is drawn separately by the renderer.
 */
function isometricImageRotation(heading, pitch, forwardOffset = 0) {
  const vector = orientationVector(heading, pitch);
  const visibleLength = Math.hypot(vector.dx, vector.dz);
  if (visibleLength <= 1e-9) return -forwardOffset * Math.PI / 180;
  return Math.atan2(-vector.dz, vector.dx) + Math.PI / 2
    - forwardOffset * Math.PI / 180;
}

function isometricTokenGeometry(token, projectionEngine, camera) {
  const width = Math.max(0.1, positiveOr(token?.width, 1) - ISOMETRIC_TOKEN_INSET);
  const height = Math.max(0.1, positiveOr(token?.height, 1) - ISOMETRIC_TOKEN_INSET);
  const depth = Math.max(0.1, positiveOr(token?.depth, 1) - ISOMETRIC_TOKEN_INSET);
  const center = token?.worldPoint ?? { x: 0, y: 0, z: 0 };
  const corner = (xSign, ySign, zSign) => projectionEngine.projectPoint({
    x: center.x + xSign * width / 2,
    y: center.y + ySign * height / 2,
    z: center.z + zSign * depth / 2
  }, camera);
  const vertices = {
    xMinusYMinusZMinus: corner(-1, -1, -1),
    xPlusYMinusZMinus: corner(1, -1, -1),
    xMinusYPlusZMinus: corner(-1, 1, -1),
    xPlusYPlusZMinus: corner(1, 1, -1),
    xMinusYMinusZPlus: corner(-1, -1, 1),
    xPlusYMinusZPlus: corner(1, -1, 1),
    xMinusYPlusZPlus: corner(-1, 1, 1),
    xPlusYPlusZPlus: corner(1, 1, 1)
  };
  const faces = {
    top: [
      vertices.xMinusYMinusZPlus,
      vertices.xPlusYMinusZPlus,
      vertices.xPlusYPlusZPlus,
      vertices.xMinusYPlusZPlus
    ],
    xPositive: [
      vertices.xPlusYMinusZMinus,
      vertices.xPlusYPlusZMinus,
      vertices.xPlusYPlusZPlus,
      vertices.xPlusYMinusZPlus
    ],
    xNegative: [
      vertices.xMinusYPlusZMinus,
      vertices.xMinusYMinusZMinus,
      vertices.xMinusYMinusZPlus,
      vertices.xMinusYPlusZPlus
    ],
    yPositive: [
      vertices.xPlusYPlusZMinus,
      vertices.xMinusYPlusZMinus,
      vertices.xMinusYPlusZPlus,
      vertices.xPlusYPlusZPlus
    ],
    yNegative: [
      vertices.xMinusYMinusZMinus,
      vertices.xPlusYMinusZMinus,
      vertices.xPlusYMinusZPlus,
      vertices.xMinusYMinusZPlus
    ]
  };
  const cameraPosition = projectionEngine.describe(camera.view).cameraPosition ?? { x: 1, y: -1 };
  const xFace = cameraPosition.x >= 0 ? faces.xPositive : faces.xNegative;
  const yFace = cameraPosition.y >= 0 ? faces.yPositive : faces.yNegative;
  // The canonical isometric direction is top / front-left / left-right. Keep
  // the artwork on the visible front face (the camera-facing Y plane), which
  // is screen-left in iso-ne instead of moving it to the side on screen-right.
  // Reorder the vertices for image mapping so source image top is cube top and
  // source image left/right always follows tactical -/+X.
  const imageFace = cameraPosition.y >= 0
    ? [
      vertices.xMinusYPlusZPlus,
      vertices.xPlusYPlusZPlus,
      vertices.xPlusYPlusZMinus,
      vertices.xMinusYPlusZMinus
    ]
    : [
      vertices.xMinusYMinusZPlus,
      vertices.xPlusYMinusZPlus,
      vertices.xPlusYMinusZMinus,
      vertices.xMinusYMinusZMinus
    ];
  return {
    faces: [yFace, xFace, faces.top],
    imageFace,
    edges: [
      [vertices.xMinusYMinusZMinus, vertices.xPlusYMinusZMinus],
      [vertices.xPlusYMinusZMinus, vertices.xPlusYPlusZMinus],
      [vertices.xPlusYPlusZMinus, vertices.xMinusYPlusZMinus],
      [vertices.xMinusYPlusZMinus, vertices.xMinusYMinusZMinus],
      [vertices.xMinusYMinusZPlus, vertices.xPlusYMinusZPlus],
      [vertices.xPlusYMinusZPlus, vertices.xPlusYPlusZPlus],
      [vertices.xPlusYPlusZPlus, vertices.xMinusYPlusZPlus],
      [vertices.xMinusYPlusZPlus, vertices.xMinusYMinusZPlus],
      [vertices.xMinusYMinusZMinus, vertices.xMinusYMinusZPlus],
      [vertices.xPlusYMinusZMinus, vertices.xPlusYMinusZPlus],
      [vertices.xPlusYPlusZMinus, vertices.xPlusYPlusZPlus],
      [vertices.xMinusYPlusZMinus, vertices.xMinusYPlusZPlus]
    ]
  };
}

function tracePolygon(context, points) {
  if (!Array.isArray(points) || points.length === 0) return false;
  context.beginPath?.();
  context.moveTo?.(points[0].x, points[0].y);
  for (const point of points.slice(1)) context.lineTo?.(point.x, point.y);
  context.closePath?.();
  return true;
}

function drawImageOnIsometricFace(context, image, face, mirrored = false, rotation = 0) {
  if (typeof context.drawImage !== "function" || !Array.isArray(face) || face.length < 4) return false;
  const [originalP0, originalP1, originalP2, originalP3] = face;
  const p0 = mirrored ? originalP1 : originalP0;
  const p1 = mirrored ? originalP0 : originalP1;
  const p3 = mirrored ? originalP2 : originalP3;
  const minX = Math.min(...face.map(({ x }) => x));
  const maxX = Math.max(...face.map(({ x }) => x));
  const minY = Math.min(...face.map(({ y }) => y));
  const maxY = Math.max(...face.map(({ y }) => y));
  const canMapFace = typeof context.save === "function"
    && typeof context.restore === "function"
    && typeof context.clip === "function"
    && typeof context.transform === "function";
  try {
    context.save?.();
    tracePolygon(context, face);
    context.clip?.();
    if (canMapFace) {
      context.transform(
        p1.x - p0.x,
        p1.y - p0.y,
        p3.x - p0.x,
        p3.y - p0.y,
        p0.x,
        p0.y
      );
      context.translate?.(0.5, 0.5);
      context.rotate?.(finiteOr(rotation, 0));
      context.translate?.(-0.5, -0.5);
      context.drawImage(image, 0, 0, 1, 1);
    } else {
      context.drawImage(image, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
    }
    context.restore?.();
    return true;
  } catch {
    try { context.restore?.(); } catch { /* best effort after a canvas error */ }
    return false;
  }
}

function normalizedGridDimensions(value) {
  const columns = Number(value?.x ?? value?.columns);
  const rows = Number(value?.y ?? value?.rows);
  const depth = Number(value?.z ?? value?.depth ?? 10);
  if (!Number.isInteger(columns) || columns < 1 || columns > 200
    || !Number.isInteger(rows) || rows < 1 || rows > 200
    || !Number.isInteger(depth) || depth < 1 || depth > 200) return null;
  return { columns, rows, z: depth };
}

function normalizedGridStyle(value) {
  return GRID_LINE_STYLES.has(value) ? value : "solid";
}

function gridWithDimensions(grid, dimensions) {
  const next = normalizedGridDimensions(dimensions);
  if (!next) return grid;
  return Object.freeze({
    ...grid,
    x: next.columns,
    y: next.rows,
    z: next.z,
    columns: next.columns,
    rows: next.rows,
    depth: next.z,
    verticalLines: Object.freeze(Array.from({ length: next.columns + 1 }, (_, index) => Object.freeze({
      x: index,
      fromY: 0,
      toY: next.rows
    }))),
    horizontalLines: Object.freeze(Array.from({ length: next.rows + 1 }, (_, index) => Object.freeze({
      y: index,
      fromX: 0,
      toX: next.columns
    })))
  });
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function formatHeading(value) {
  const normalized = snapHeading(finiteOr(value, 0));
  return String(normalized).padStart(3, "0");
}

function screenCenterFor(viewport, pan) {
  const { width, height } = dimensionsOf(viewport);
  return {
    x: width / 2 + finiteOr(pan?.x, 0),
    y: height / 2 + finiteOr(pan?.y, 0)
  };
}

function fitDimension(value, margin) {
  const inset = Math.max(0, finiteOr(margin, DEFAULT_GRID_MARGIN));
  return Math.max(1, value - inset * 2);
}

function fitScaleFor(viewport, horizontalExtent, verticalExtent, margin) {
  const { width, height } = dimensionsOf(viewport);
  return Math.min(
    fitDimension(width, margin) / Math.max(1, horizontalExtent),
    fitDimension(height, margin) / Math.max(1, verticalExtent)
  );
}

function cameraForTop({ view = "top", grid, viewport, zoom, focus, pan, fitMargin = DEFAULT_GRID_MARGIN }) {
  const fitScale = fitScaleFor(viewport, grid.columns, grid.rows, fitMargin);
  return {
    view,
    focus: focus ?? { x: grid.columns / 2, y: grid.rows / 2, z: 0 },
    // `zoom` is the logical tactical scale: CSS pixels per tactical cell.
    // When omitted, retain the initial fit-to-panel behavior for callers that
    // have not opted into session navigation yet.
    scale: positiveOr(zoom, fitScale),
    screenCenter: screenCenterFor(viewport, pan)
  };
}

function zBounds(tacticalStates = [], configuredDepth) {
  const levels = tacticalStates
    .map((state) => state?.tacticalZ)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const configuredMaximum = Number.isInteger(configuredDepth) && configuredDepth > 0
    ? configuredDepth
    : 0;
  if (configuredMaximum > 0) {
    return {
      min: 0,
      max: configuredMaximum
    };
  }
  const minimum = Math.min(0, ...(levels.length ? levels : [0]));
  const maximum = Math.max(0, ...(levels.length ? levels : [0]));
  return {
    min: Math.floor(minimum) - 2,
    max: Math.ceil(maximum) + 2
  };
}

function cameraForIsometric({ definition, grid, viewport, zoom, focus, pan, tacticalStates,
  fitMargin = DEFAULT_GRID_MARGIN }) {
  const bounds = zBounds(tacticalStates, grid.depth);
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
  const fitScale = fitScaleFor(viewport, horizontalExtent, verticalExtent, fitMargin);
  return {
    view: definition.id,
    focus: focus ?? defaultFocus,
    scale: positiveOr(zoom, fitScale),
    screenCenter: screenCenterFor(viewport, pan)
  };
}

function cameraForOrthographic({ definition, grid, viewport, zoom, focus, pan, tacticalStates,
  fitMargin = DEFAULT_GRID_MARGIN }) {
  const isTop = definition.visibleAxes.includes("y") && definition.hiddenAxis === "z";
  const horizontalAxis = definition.horizontal.axis;
  const horizontalExtent = horizontalAxis === "x" ? grid.columns : grid.rows;
  if (isTop) {
    return cameraForTop({
      view: definition.id,
      grid,
      viewport,
      zoom,
      focus,
      pan,
      fitMargin
    });
  }

  const bounds = zBounds(tacticalStates, grid.depth);
  const fitScale = fitScaleFor(
    viewport,
    horizontalExtent,
    bounds.max - bounds.min,
    fitMargin
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
    sourceColumns: grid.columns,
    sourceRows: grid.rows,
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
        // The zero-elevation plane is a normal grid line. Marking it as a
        // major line creates an H-shaped heavy outline when negative and
        // positive Z levels are both visible.
        major: z === zRange.min || z === zRange.max
      };
    }
  );
  return Object.freeze({
    columns: extent,
    rows: zRange.max - zRange.min,
    sourceColumns: grid.columns,
    sourceRows: grid.rows,
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
    sourceColumns: grid.columns,
    sourceRows: grid.rows,
    zMin: zRange.min,
    zMax: zRange.max,
    lines: Object.freeze(lines)
  });
}

function staticKeyFor({ sceneId, view, camera, grid, width, height, dpr, gridOverlay, gridOpacity, gridStyle, debugAxes, background }) {
  return [
    sceneId,
    view,
    camera.scale,
    camera.focus.x,
    camera.focus.y,
    camera.focus.z,
    camera.screenCenter.x,
    camera.screenCenter.y,
    grid?.sourceColumns ?? grid?.columns,
    grid?.sourceRows ?? grid?.rows,
    grid?.zMin,
    grid?.zMax,
    width,
    height,
    dpr,
    gridOverlay,
    gridOpacity,
    gridStyle,
    debugAxes,
    background?.color,
    background?.image
  ].join(":");
}

function staticKey(model, width, height, dpr) {
  return staticKeyFor({
    sceneId: model.sceneId,
    view: model.view,
    camera: model.camera,
    grid: model.grid,
    width,
    height,
    dpr,
    gridOverlay: model.overlays.grid,
    gridOpacity: model.overlays.gridOpacity,
    gridStyle: model.overlays.gridStyle,
    debugAxes: model.overlays.debugAxes,
    background: model.background
  });
}

function sceneGridKey(scene) {
  const dimensions = scene?.dimensions ?? scene ?? {};
  const grid = scene?.grid ?? {};
  return [
    scene?.id ?? "",
    dimensions.width,
    dimensions.height,
    grid.type,
    grid.size,
    grid.sizeX,
    grid.sizeY,
    grid.distance
  ].join(":");
}

function visibleToken(state, projectionEngine, camera, viewport, definition, selectedTokenId = null) {
  if (!state || state.visibleToCurrentUser !== true || state.participating !== true) return null;
  const depth = tokenDimensions(state).depth;
  // Foundry elevation is the bottom of the token's vertical cell footprint.
  // Keep the canonical tactical Z unchanged for state/readouts, but project
  // the marker at the center of that cell so it never sits on a Z grid line.
  const worldPoint = {
    x: state.tacticalX,
    y: state.tacticalY,
    z: state.tacticalZ + depth / 2
  };
  const point = projectionEngine.projectPoint(worldPoint, camera);
  const footprint = projectedFootprint({
    state,
    projectionEngine,
    camera,
    definition,
    worldPoint
  });
  const markerRadius = Math.max(4, footprint.width / 2, footprint.height / 2);
  const { width, height } = dimensionsOf(viewport);
  if (point.x + markerRadius < 0 || point.x - markerRadius > width
    || point.y + markerRadius < 0 || point.y - markerRadius > height) return null;

  const orientation = projectionEngine.projectOrientationVector(
    orientationVector(state.heading, state.pitch),
    { ...camera, scale: camera.scale * 0.5 }
  );
  const forwardOffset = state.textureSource
    ? 0
    : finiteOr(state.art?.forwardOffset, 0) * Math.PI / 180;
  const artRotation = definition.basis
    ? isometricImageRotation(state.heading, state.pitch, finiteOr(state.art?.forwardOffset, 0))
    : (() => {
      const artDirection = projectionEngine.projectOrientationVector(
        orientationVector(state.heading, 0),
        { ...camera, scale: 1 }
      );
      const artDirectionLength = Math.hypot(artDirection.x, artDirection.y);
      return artDirectionLength > 1e-9
        ? Math.atan2(artDirection.y, artDirection.x) + Math.PI / 2 - forwardOffset
        : -forwardOffset;
    })();
  return {
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
    depth,
    // Native Token texture is authoritative. Legacy Tactical Viewer art flags
    // are deliberately not allowed to replace the document's real token.
    art: state.textureSource
      ? { icon: state.textureSource, preset: "generic-marker", forwardOffset: 0 }
      : state.art,
    artRotation,
    worldPoint: Object.freeze(worldPoint),
    depthKey: definition.basis ? projectionEngine.depthKey(worldPoint, camera) : null,
    hiddenAxis: definition.hiddenAxis,
    hiddenAxisLabel: definition.hiddenAxis ? definition.hiddenAxis.toUpperCase() : null,
    hiddenAxisValue: definition.hiddenAxis
      ? definition.hiddenAxis === "z"
        ? state.tacticalZ
        : worldPoint[definition.hiddenAxis]
      : null,
    point,
    orientation,
    isometric: Boolean(definition.basis),
    markerRadius,
    footprintWidth: footprint.width,
    footprintHeight: footprint.height,
    multiCell: tokenDimensions(state).width > 1
      || tokenDimensions(state).height > 1
      || tokenDimensions(state).depth > 1,
    selected: selectedTokenId !== null && state.tokenId === selectedTokenId
  };
}

function compareTokenIds(left, right) {
  const leftId = String(left?.tokenId ?? "");
  const rightId = String(right?.tokenId ?? "");
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

function accessibleTokenLabel(token) {
  const name = token.name || token.tokenId;
  if (!token.hiddenAxisLabel) return name;
  return `${name}, ${token.hiddenAxisLabel} ${token.hiddenAxisValue}`;
}

/**
 * Find connected groups of visible projected markers whose circles touch.
 * This operates on renderer-facing records only, so hidden documents cannot
 * enter a stack through a later consumer.
 */
export function detectProjectedOverlaps(projectedTokens = []) {
  if (!Array.isArray(projectedTokens)) return Object.freeze([]);
  const tokens = projectedTokens.filter((token) =>
    token?.visibleToCurrentUser === true
    && token?.culled !== true
    && Number.isFinite(token?.point?.x)
    && Number.isFinite(token?.point?.y)
    && Number.isFinite(token?.markerRadius)
  );
  const parent = tokens.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < tokens.length; left += 1) {
    for (let right = left + 1; right < tokens.length; right += 1) {
      const distance = Math.hypot(
        tokens[left].point.x - tokens[right].point.x,
        tokens[left].point.y - tokens[right].point.y
      );
      if (distance <= tokens[left].markerRadius + tokens[right].markerRadius) {
        union(left, right);
      }
    }
  }

  const groups = new Map();
  tokens.forEach((token, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(token);
    groups.set(root, group);
  });
  return Object.freeze([...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => Object.freeze(group.slice().sort(compareTokenIds))));
}

function addOverlapMetadata(tokens, definition) {
  const groups = detectProjectedOverlaps(tokens);
  const byToken = new Map();
  const stacks = groups.map((group) => {
    const first = group[0];
    const stackId = `stack:${group.map(({ tokenId }) => String(tokenId)).join("|")}`;
    const candidates = Object.freeze(group.map((token) => Object.freeze({
      tokenId: token.tokenId,
      name: token.name,
      visibleToCurrentUser: true,
      hiddenAxis: definition.hiddenAxis,
      hiddenAxisLabel: token.hiddenAxisLabel,
      hiddenAxisValue: token.hiddenAxisValue,
      accessibleLabel: accessibleTokenLabel(token)
    })));
    group.forEach((token) => byToken.set(token.tokenId, {
      stackId,
      stackCount: group.length
    }));
    return Object.freeze({
      stackId,
      count: group.length,
      point: first.point,
      markerRadius: Math.max(...group.map(({ markerRadius }) => markerRadius)),
      hiddenAxis: definition.hiddenAxis,
      candidates
    });
  });
  for (const token of tokens) {
    const metadata = byToken.get(token.tokenId);
    token.stackId = metadata?.stackId ?? null;
    token.stackCount = metadata?.stackCount ?? 1;
  }
  return { tokens, stacks: Object.freeze(stacks) };
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
  selectionBox = null,
  movementPreview = null,
  staticGridProvider,
  gridGeometry,
  gridDimensions,
  background,
  fitMargin = DEFAULT_GRID_MARGIN
} = {}) {
  const definition = projectionEngine.describe(view);
  const tacticalGrid = gridWithDimensions(
    gridGeometry ?? coordinateAdapter.getTopGrid(scene),
    gridDimensions
  );
  const zRange = definition.visibleAxes.includes("z")
    ? zBounds(tacticalStates, tacticalGrid.depth)
    : ZERO_Z_RANGE;
  const camera = definition.basis
    ? cameraForIsometric({
      definition,
      grid: tacticalGrid,
      viewport,
      zoom,
      focus,
      pan,
      tacticalStates,
      fitMargin
    })
    : cameraForOrthographic({
      definition,
      grid: tacticalGrid,
      viewport,
      zoom,
      focus,
      pan,
      tacticalStates,
      fitMargin
    });
  const grid = staticGridProvider?.({
    grid: tacticalGrid,
    camera,
    projectionEngine,
    zRange,
    definition
  }) ?? (definition.basis
    ? projectedIsometricGrid({
      grid: tacticalGrid,
      camera,
      projectionEngine,
      zRange
    })
    : definition.visibleAxes.includes("z")
    ? projectedVerticalGrid({
      grid: tacticalGrid,
      camera,
      projectionEngine,
      zRange,
      definition
    })
    : projectedGrid({ grid: tacticalGrid, camera, projectionEngine }));
  const projectedTokens = [];
  for (const state of (Array.isArray(tacticalStates) ? tacticalStates : [])) {
    const effectiveState = movementPreview?.tokenId === state?.tokenId
      ? { ...state, ...movementPreview, preview: true }
      : state;
    if (effectiveState?.visibleToCurrentUser !== true || effectiveState?.participating !== true) {
      continue;
    }
    const projected = visibleToken(
      effectiveState,
      projectionEngine,
      camera,
      viewport,
      definition,
      selectedTokenId
    );
    if (!projected) {
      continue;
    }
    projectedTokens.push(projected);
  }
  const withOverlapMetadata = addOverlapMetadata(projectedTokens, definition);
  const orderedTokens = definition.basis
      ? projectionEngine.sortByDepth(withOverlapMetadata.tokens, camera, {
        getPoint: (token) => token.worldPoint
      })
      : withOverlapMetadata.tokens;
  for (const token of orderedTokens) Object.freeze(token);
  const tokens = Object.freeze(orderedTokens);
  return Object.freeze({
    sceneId: scene?.id,
    view,
    camera: Object.freeze(camera),
    grid,
    tokens,
    stacks: withOverlapMetadata.stacks,
    overlaps: withOverlapMetadata.stacks,
    selectionBox,
    movementPreview,
    selectedTokenId,
    background: Object.freeze({
      color: typeof background?.color === "string" ? background.color : DEFAULT_BACKGROUND,
      image: typeof background?.image === "string" ? background.image : ""
    }),
    axisLabels: projectionEngine.describe(view).labels,
    overlays: Object.freeze({
      grid: overlays.grid !== false,
      gridOpacity: Number.isFinite(overlays.gridOpacity)
        ? Math.min(1, Math.max(0, overlays.gridOpacity))
        : 1,
      gridStyle: normalizedGridStyle(overlays.gridStyle),
      coordinates: overlays.coordinates !== false,
      debugAxes: overlays.debugAxes === true,
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

export function createBottomRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "bottom" });
}

export function createLeftRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "left" });
}

export function createRightRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "right" });
}

export function createFrontRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "front" });
}

export function createBackRenderModel(options = {}) {
  return createOrthographicRenderModel({ ...options, view: "back" });
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
  const view = options.view ?? "isometric";
  if (view !== "isometric" && !view.startsWith("iso-")) {
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
  "top", "bottom", "left", "right", "front", "back"
]);

export const RENDERABLE_VIEW_IDS = Object.freeze([
  ...RENDERABLE_ORTHOGRAPHIC_VIEW_IDS,
  "isometric"
]);

const LEGACY_RENDERABLE_VIEW_IDS = new Set([
  "north", "south", "east", "west", "iso-ne", "iso-se", "iso-sw", "iso-nw"
]);

export function isRenderableOrthographicView(view) {
  return RENDERABLE_ORTHOGRAPHIC_VIEW_IDS.includes(view)
    || ["north", "south", "east", "west"].includes(view);
}

export function isRenderableView(view) {
  return RENDERABLE_VIEW_IDS.includes(view) || LEGACY_RENDERABLE_VIEW_IDS.has(view);
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

function drawTacticalImage(context, image, point, width, height, rotation, mirrored) {
  if (typeof context.drawImage !== "function") return false;
  const canTransform = typeof context.save === "function"
    && typeof context.restore === "function"
    && typeof context.translate === "function"
    && typeof context.rotate === "function"
    && (!mirrored || typeof context.scale === "function");
  try {
    if (!canTransform) {
      context.drawImage(
        image,
        point.x - width / 2,
        point.y - height / 2,
        width,
        height
      );
      return true;
    }
    context.save();
    context.translate(point.x, point.y);
    context.rotate(finiteOr(rotation, 0));
    if (mirrored) context.scale(-1, 1);
    context.drawImage(
      image,
      -width / 2,
      -height / 2,
      width,
      height
    );
    context.restore();
    return true;
  } catch {
    try { context.restore?.(); } catch { /* best effort after a canvas error */ }
    return false;
  }
}

/** Concrete read-only schematic renderer for all fixed tactical views. */
export class Canvas2DRendererV1 extends Canvas2DRenderer {
  constructor({
    coordinateAdapter = new CoordinateAdapter(),
    projectionEngine = new ProjectionEngine(),
    assetManager = new AssetManager(),
    colors = {},
    maxStaticLayers = 8
  } = {}) {
    super();
    this.coordinateAdapter = coordinateAdapter;
    this.projectionEngine = projectionEngine;
    this.assetManager = assetManager;
    this.colors = { ...colors };
    this.maxStaticLayers = Number.isInteger(maxStaticLayers) && maxStaticLayers > 0
      ? maxStaticLayers
      : 8;
    this.staticGridCache = new Map();
    this.gridGeometryCache = new Map();
    this.pendingAssetInvalidations = new Set();
  }

  get staticLayerCacheSize() {
    return this.staticGridCache.size;
  }

  clearStaticCache() {
    const removed = this.staticGridCache.size;
    this.staticGridCache.clear();
    return removed;
  }

  invalidate(invalidation = {}) {
    if (["resize", "scene-update", "view-change", "reconnect", "asset-loaded"].includes(invalidation?.type)) {
      this.clearStaticCache();
    }
    if (["scene-update", "reconnect"].includes(invalidation?.type)) this.gridGeometryCache.clear();
    return true;
  }

  getCachedGridGeometry(scene) {
    const key = sceneGridKey(scene);
    const existing = this.gridGeometryCache.get(key);
    if (existing) return existing;
    const geometry = this.coordinateAdapter.getTopGrid(scene);
    this.gridGeometryCache.set(key, geometry);
    while (this.gridGeometryCache.size > this.maxStaticLayers) {
      const oldest = this.gridGeometryCache.keys().next().value;
      if (oldest === undefined) break;
      this.gridGeometryCache.delete(oldest);
    }
    return geometry;
  }

  #touchStatic(key, record) {
    this.staticGridCache.delete(key);
    this.staticGridCache.set(key, record);
  }

  #trimStaticCache() {
    while (this.staticGridCache.size > this.maxStaticLayers) {
      const oldest = this.staticGridCache.keys().next().value;
      if (oldest === undefined) return;
      this.staticGridCache.delete(oldest);
    }
  }

  getCachedGrid({ sceneId, view, camera, grid, width, height, dpr, gridOverlay,
    gridOpacity, gridStyle, debugAxes, background, projectionEngine, definition, zRange }) {
    const isZView = definition.visibleAxes.includes("z");
    const key = staticKeyFor({
      sceneId,
      view,
      camera,
      grid: {
        columns: grid.columns,
        rows: grid.rows,
        zMin: isZView ? zRange.min : undefined,
        zMax: isZView ? zRange.max : undefined
      },
      width,
      height,
      dpr,
      gridOverlay,
      gridOpacity,
      gridStyle,
      debugAxes,
      background
    });
    const existing = this.staticGridCache.get(key);
    if (existing) {
      this.#touchStatic(key, existing);
      return existing.grid;
    }

    const projected = definition.basis
      ? projectedIsometricGrid({ grid, camera, projectionEngine, zRange })
      : definition.visibleAxes.includes("z")
      ? projectedVerticalGrid({ grid, camera, projectionEngine, zRange, definition })
      : projectedGrid({ grid, camera, projectionEngine });
    this.staticGridCache.set(key, { key, grid: projected, surface: null });
    this.#trimStaticCache();
    return projected;
  }

  buildModel(input) {
    const panel = input?.panel ?? input?.state?.panels?.[input?.panelIndex ?? 0] ?? {};
    const modelOptions = {
      scene: input.scene,
      coordinateAdapter: this.coordinateAdapter,
      projectionEngine: this.projectionEngine,
      gridGeometry: this.getCachedGridGeometry(input.scene),
      gridDimensions: input.gridDimensions,
      tacticalStates: input.visibleTacticalStates,
      viewport: input.viewport,
      zoom: panel.zoom,
      focus: panel.focus,
      pan: panel.pan,
      overlays: panel.overlays,
      background: input.background ?? input.state?.background,
      selectedTokenId: input?.selectedTokenId ?? input?.state?.selectedTokenId,
      selectionBox: input?.selectionBox
        ?? (input?.state?.selectionBox
          && input.state.selectionBox.panelIndex === input?.panelIndex
          ? input.state.selectionBox
          : null),
      movementPreview: input?.state?.movementPreview
    };
    const viewport = input.viewport;
    const dpr = positiveOr(input.devicePixelRatio, 1);
    const sceneId = input.scene?.id;
    const staticGridProvider = ({ grid, camera, projectionEngine, zRange, definition }) =>
      this.getCachedGrid({
        sceneId,
        view: panel.view,
        camera,
        grid,
        width: dimensionsOf(viewport).width,
        height: dimensionsOf(viewport).height,
        dpr,
        gridOverlay: panel.overlays?.grid !== false,
        gridOpacity: panel.overlays?.gridOpacity,
        gridStyle: panel.overlays?.gridStyle,
        debugAxes: panel.overlays?.debugAxes === true,
        background: input.background ?? input.state?.background,
        projectionEngine,
        definition,
        zRange
      });
    if (!isRenderableView(panel.view)) return createTopRenderModel(modelOptions);
    return createOrthographicRenderModel({
      ...modelOptions,
      view: panel.view,
      staticGridProvider
    });
  }

  drawStatic(context, model, width, height, dpr = 1, transform = true) {
    if (transform) {
      context.save?.();
      context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    }
    context.fillStyle = model.background?.color ?? this.colors.background ?? DEFAULT_BACKGROUND;
    context.fillRect?.(0, 0, width, height);
    const backgroundImage = model.background?.image
      ? this.assetManager?.peek?.(model.background.image)
      : null;
    if (backgroundImage && typeof context.drawImage === "function") {
      try {
        context.drawImage(backgroundImage, 0, 0, width, height);
      } catch {
        // The configured color remains the fallback when an image cannot draw.
      }
    }
    if (model.overlays.grid) {
      const gridOpacity = Number.isFinite(model.overlays.gridOpacity)
        ? Math.min(1, Math.max(0, model.overlays.gridOpacity))
        : 1;
      const gridStyle = normalizedGridStyle(model.overlays.gridStyle);
      const lineDash = gridStyle === "dashes"
        ? [8, 6]
        : gridStyle === "dots"
          ? [1, 5]
          : [];
      context.lineWidth = 1;
      const previousAlpha = context.globalAlpha;
      const previousLineCap = context.lineCap;
      const lines = model.grid.lines
        ?? [...model.grid.verticalLines, ...model.grid.horizontalLines];
      for (const line of lines) {
        context.beginPath?.();
        context.globalAlpha = line.major ? 1 : gridOpacity;
        // Major lines retain their stronger color/opacity, but they obey the
        // selected line pattern too. This is especially important in the
        // isometric volume, where every outer edge is marked major.
        context.setLineDash?.(lineDash);
        context.lineCap = gridStyle === "dots" ? "round" : "butt";
        context.strokeStyle = line.major
          ? this.colors.gridMajor ?? DEFAULT_GRID_MAJOR
          : this.colors.grid ?? DEFAULT_GRID;
        drawLine(context, line.start, line.end);
        context.stroke?.();
      }
      context.setLineDash?.([]);
      context.lineCap = previousLineCap;
      context.globalAlpha = previousAlpha;
    }
    if (model.overlays.debugAxes && model.axisLabels) {
      context.fillStyle = this.colors.text ?? DEFAULT_TEXT;
      context.font = "12px sans-serif";
      context.fillText?.(model.axisLabels.horizontal, 8, Math.max(14, height - 8));
      context.fillText?.(model.axisLabels.vertical, 8, 14);
      const depthLabel = model.axisLabels.hidden ?? model.axisLabels.depth ?? "";
      context.fillText?.(localizeFormat("renderer.hidden", `Hidden: ${depthLabel}`, { axis: depthLabel }), Math.max(8, width - 132), 14);
    }
    if (transform) context.restore?.();
  }

  getStaticLayer(model, canvas, width, height, dpr) {
    const key = staticKey(model, width, height, dpr);
    const cached = this.staticGridCache.get(key);
    if (cached?.surface) {
      this.#touchStatic(key, cached);
      return cached.surface;
    }

    const document = canvas?.ownerDocument ?? globalThis?.document;
    const surface = typeof globalThis?.OffscreenCanvas === "function"
      ? new globalThis.OffscreenCanvas(Math.max(1, Math.round(width * dpr)), Math.max(1, Math.round(height * dpr)))
      : document?.createElement?.("canvas");
    if (!surface?.getContext) {
      return null;
    }
    surface.width = Math.max(1, Math.round(width * dpr));
    surface.height = Math.max(1, Math.round(height * dpr));
    const staticContext = surface.getContext("2d");
    if (!staticContext) return null;
    this.drawStatic(staticContext, model, width, height, dpr);
    const record = cached ?? { key, grid: model.grid, surface: null };
    record.surface = surface;
    this.staticGridCache.set(key, record);
    this.#touchStatic(key, record);
    this.#trimStaticCache();
    return surface;
  }

  render(input = {}) {
    const context = input.context;
    if (!context) return false;
    if (input.invalidation) this.invalidate(input.invalidation);
    const model = input.model ?? this.buildModel(input);
    const { width, height } = dimensionsOf(input.viewport);
    const dpr = positiveOr(input.devicePixelRatio,
      width > 0 ? (input.canvas?.width ?? width) / width : 1);

    this.requestBackground(model.background, input);

    context.save?.();
    context.setTransform?.(dpr, 0, 0, dpr, 0, 0);
    const staticSurface = this.getStaticLayer(model, input.canvas, width, height, dpr);
    if (staticSurface && typeof context.drawImage === "function") {
      context.drawImage(staticSurface, 0, 0, width, height);
    } else {
      this.drawStatic(context, model, width, height, dpr, false);
    }

    for (const token of model.tokens) {
      const { point, markerRadius, footprintWidth, footprintHeight, orientation } = token;
      const tokenIsometric = token.isometric === true || isometricView(model.view);
      const art = this.assetManager?.peekArt?.(token.art, model.view);
      if (tokenIsometric) {
        if (!art?.image) this.requestArt(token.art, model.view, input);
        this.drawIsometricToken(
          context,
          token,
          model.camera,
          art?.image,
          art?.mirrored === true,
          art?.forwardOffset
        );
      } else {
        const configuredForwardOffset = finiteOr(token.art?.forwardOffset, 0);
        const resolvedForwardOffset = finiteOr(art?.forwardOffset, configuredForwardOffset);
        const imageDrawn = art?.image
          ? drawTacticalImage(
            context,
            art.image,
            point,
            footprintWidth ?? markerRadius * 2,
            footprintHeight ?? markerRadius * 2,
            token.artRotation + (configuredForwardOffset - resolvedForwardOffset) * Math.PI / 180,
            art.mirrored === true
          )
          : false;
        if (!imageDrawn) {
          this.requestArt(token.art, model.view, input);
          // Keep the token visible while native/custom artwork loads or if it
          // fails. The generated marker is the stable, projection-independent
          // fallback and preserves the token footprint.
          this.drawGeneratedMarker(
            context,
            point,
            markerRadius,
            footprintWidth,
            footprintHeight,
            token.multiCell
          );
        }
      }

      if (token.preview) {
        context.strokeStyle = this.colors.preview ?? "#8bd8ff";
        context.setLineDash?.([6, 4]);
        if (tokenIsometric) {
          this.drawIsometricTokenOutline(context, token, model.camera);
        } else {
          context.beginPath?.();
          context.arc?.(point.x, point.y, markerRadius + 6, 0, Math.PI * 2);
          context.stroke?.();
        }
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
        context.fillText?.(localizeFormat("renderer.elevation", `Z ${formatSigned(token.tacticalZ)}`, {
          value: formatSigned(token.tacticalZ)
        }), labelX, labelY + 14);
      }
      if (model.overlays.heading) {
        const heading = formatHeading(token.heading);
        context.fillText?.(localizeFormat("renderer.heading", `H ${heading}°`, {
          value: heading
        }), labelX, labelY + 28);
      }
      if (model.overlays.pitch) {
        context.fillText?.(localizeFormat("renderer.pitch", `P ${formatSigned(token.pitch)}°`, {
          value: formatSigned(token.pitch)
        }), labelX, labelY + 42);
      }
      if (token.offGrid) context.fillText?.(localize("renderer.offGrid", "OFF GRID"), labelX, labelY + 56);
    }

    for (const stack of model.stacks ?? []) {
      context.fillStyle = this.colors.text ?? DEFAULT_TEXT;
      context.font = "bold 12px sans-serif";
      context.fillText?.(localizeFormat("renderer.stackCount", `x${stack.count}`, { count: stack.count }),
        stack.point.x + stack.markerRadius,
        stack.point.y - stack.markerRadius);
    }

    if (model.selectionBox) {
      const left = Math.min(model.selectionBox.start?.x, model.selectionBox.end?.x);
      const top = Math.min(model.selectionBox.start?.y, model.selectionBox.end?.y);
      const boxWidth = Math.abs(model.selectionBox.end?.x - model.selectionBox.start?.x);
      const boxHeight = Math.abs(model.selectionBox.end?.y - model.selectionBox.start?.y);
      if ([left, top, boxWidth, boxHeight].every(Number.isFinite)) {
        context.save?.();
        context.fillStyle = this.colors.selectionFill ?? "rgba(139, 216, 255, 0.14)";
        context.strokeStyle = this.colors.selection ?? "#8bd8ff";
        context.setLineDash?.([6, 4]);
        context.fillRect?.(left, top, boxWidth, boxHeight);
        context.strokeRect?.(left, top, boxWidth, boxHeight);
        context.setLineDash?.([]);
        context.restore?.();
      }
    }

    // Selection is deliberately a final overlay. Bodies remain in canonical
    // far-to-near order while a selected token remains understandable when a
    // nearer marker partly occludes it.
    for (const token of model.tokens) {
      if (!token.selected) continue;
      context.beginPath?.();
      context.strokeStyle = this.colors.selection ?? "#ffffff";
      context.setLineDash?.([5, 3]);
      if (token.isometric === true || isometricView(model.view)) {
        this.drawIsometricTokenOutline(context, token, model.camera);
      } else {
        context.arc?.(token.point.x, token.point.y, token.markerRadius + 4, 0, Math.PI * 2);
        context.stroke?.();
      }
      context.setLineDash?.([]);
    }

    context.restore?.();
    return true;
  }

  drawIsometricToken(
    context,
    token,
    camera,
    image = null,
    mirrored = false,
    resolvedForwardOffset = undefined
  ) {
    const geometry = isometricTokenGeometry(token, this.projectionEngine, camera);
    const faceColors = [
      this.colors.isometricYFace ?? DEFAULT_ISOMETRIC_Y_FACE,
      this.colors.isometricXFace ?? DEFAULT_ISOMETRIC_X_FACE,
      this.colors.isometricTop ?? DEFAULT_ISOMETRIC_TOP
    ];
    for (const [index, face] of geometry.faces.entries()) {
      tracePolygon(context, face);
      context.fillStyle = faceColors[index];
      context.fill?.();
    }
    const configuredForwardOffset = finiteOr(token.art?.forwardOffset, 0);
    const actualForwardOffset = finiteOr(resolvedForwardOffset, configuredForwardOffset);
    if (image) drawImageOnIsometricFace(
      context,
      image,
      geometry.imageFace,
      mirrored,
      token.artRotation + (configuredForwardOffset - actualForwardOffset) * Math.PI / 180
    );

    context.strokeStyle = this.colors.isometricEdge ?? DEFAULT_ISOMETRIC_EDGE;
    context.lineWidth = 1;
    for (const [start, end] of geometry.edges) {
      context.beginPath?.();
      drawLine(context, start, end);
      context.stroke?.();
    }
    return true;
  }

  drawIsometricTokenOutline(context, token, camera) {
    const geometry = isometricTokenGeometry(token, this.projectionEngine, camera);
    for (const [start, end] of geometry.edges) {
      context.beginPath?.();
      drawLine(context, start, end);
      context.stroke?.();
    }
    return true;
  }

  drawGeneratedMarker(context, point, markerRadius, footprintWidth, footprintHeight, multiCell = false) {
    if (multiCell && typeof context.fillRect === "function"
      && typeof context.strokeRect === "function") {
      context.fillStyle = this.colors.token ?? DEFAULT_TOKEN;
      context.fillRect(
        point.x - footprintWidth / 2,
        point.y - footprintHeight / 2,
        footprintWidth,
        footprintHeight
      );
      context.strokeStyle = this.colors.tokenStroke ?? DEFAULT_TOKEN_STROKE;
      context.strokeRect(
        point.x - footprintWidth / 2,
        point.y - footprintHeight / 2,
        footprintWidth,
        footprintHeight
      );
      return;
    }
    context.beginPath?.();
    context.fillStyle = this.colors.token ?? DEFAULT_TOKEN;
    context.arc?.(point.x, point.y, markerRadius, 0, Math.PI * 2);
    context.fill?.();
    context.strokeStyle = this.colors.tokenStroke ?? DEFAULT_TOKEN_STROKE;
    context.stroke?.();
    if (multiCell && typeof context.strokeRect === "function") {
      context.strokeRect(
        point.x - footprintWidth / 2,
        point.y - footprintHeight / 2,
        footprintWidth,
        footprintHeight
      );
    }
  }

  requestArt(art, view, input) {
    if (typeof this.assetManager?.loadArt !== "function") return;
    const candidates = getTacticalArtCandidates(art, view);
    const key = `${view}|${candidates.map(({ source, mirrored }) =>
      `${mirrored ? "m" : "n"}:${source}`).join("|")}`;
    const before = this.assetManager.peekArt?.(art, view) ?? null;
    const promise = this.assetManager.loadArt(art, view);
    if (typeof input.invalidate !== "function" || this.pendingAssetInvalidations.has(key)) return;
    this.pendingAssetInvalidations.add(key);
    Promise.resolve(promise).then(() => {
      this.pendingAssetInvalidations.delete(key);
      const after = this.assetManager.peekArt?.(art, view) ?? null;
      if (!before?.image && after?.image) {
        input.invalidate({ type: "asset-loaded", view, source: after.source });
      }
    }, () => {
      this.pendingAssetInvalidations.delete(key);
    });
  }

  requestBackground(background, input) {
    const source = typeof background?.image === "string" ? background.image.trim() : "";
    if (!source || typeof this.assetManager?.load !== "function") return;
    const key = `background|${source}`;
    const before = this.assetManager.peek?.(source);
    const promise = this.assetManager.load(source);
    if (typeof input.invalidate !== "function" || this.pendingAssetInvalidations.has(key)) return;
    this.pendingAssetInvalidations.add(key);
    Promise.resolve(promise).then(() => {
      this.pendingAssetInvalidations.delete(key);
      const after = this.assetManager.peek?.(source);
      if (!before && after) input.invalidate({ type: "asset-loaded", source });
    }, () => this.pendingAssetInvalidations.delete(key));
  }

  /** Compatibility helper for callers that requested a generic preset directly. */
  requestAsset(preset, input) {
    return this.requestArt({ preset }, input?.view ?? "top", input);
  }
}

export const TacticalCanvasRenderer = Canvas2DRendererV1;
export const createCanvas2DRenderer = (options) => new Canvas2DRendererV1(options);
