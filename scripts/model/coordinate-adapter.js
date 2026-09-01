import { SceneEligibilityService } from "../scene-eligibility.js";
import { ElevationAdapter } from "./elevation-adapter.js";

const EPSILON = 1e-9;
const DEFAULT_TOP_LEFT_SNAP_MODE = 256;

function defaultGridProvider() {
  return globalThis.canvas?.grid;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value) {
  return finiteNumber(value) && value > 0;
}

function freezePoint(x, y) {
  return Object.freeze({ x, y });
}

function freezeOffset(i, j) {
  return Object.freeze({ i, j });
}

function integerOffset(value) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > EPSILON) {
    throw new CoordinateAdapterError(
      "A tactical anchor must align with a whole-cell token top-left offset."
    );
  }
  return rounded;
}

function tokenData(token) {
  const data = token?.document ?? token;
  if (!data || typeof data !== "object") {
    throw new TypeError("A TokenDocument-like object is required");
  }

  const width = data.width ?? 1;
  const height = data.height ?? 1;
  if (!finiteNumber(data.x) || !finiteNumber(data.y)) {
    throw new TypeError("TokenDocument x and y must be finite pixel coordinates");
  }
  if (!positiveNumber(width) || !positiveNumber(height)) {
    throw new TypeError("TokenDocument width and height must be positive grid dimensions");
  }
  const elevation = data.elevation ?? 0;
  if (!finiteNumber(elevation)) {
    throw new TypeError("TokenDocument elevation must be a finite Scene-distance value");
  }

  return {
    id: data.id ?? token.id,
    x: data.x,
    y: data.y,
    width,
    height,
    elevation
  };
}

function gridSize(grid) {
  const sizeX = grid.sizeX ?? grid.size;
  const sizeY = grid.sizeY ?? grid.size;
  if (!positiveNumber(sizeX) || !positiveNumber(sizeY)) {
    throw new CoordinateAdapterError("The square grid does not expose positive sizeX/sizeY values.");
  }
  return { sizeX, sizeY };
}

function pointFromGrid(methodName, value) {
  if (!value || !finiteNumber(value.x) || !finiteNumber(value.y)) {
    throw new CoordinateAdapterError(`SquareGrid.${methodName} did not return a valid point.`);
  }
  return value;
}

/**
 * Error raised when a Scene cannot provide a safe square-grid coordinate
 * conversion. The eligibility result is retained for diagnostics/UI callers.
 */
export class CoordinateAdapterError extends Error {
  constructor(message, { eligibility } = {}) {
    super(message);
    this.name = "CoordinateAdapterError";
    this.eligibility = eligibility ?? null;
  }
}

/**
 * The only production boundary that translates Foundry token pixels to the
 * tactical XY anchor and back. It consumes a public v14 grid instance rather
 * than reproducing grid-origin or padding arithmetic.
 */
export class CoordinateAdapter {
  constructor({
    eligibilityService = new SceneEligibilityService(),
    gridProvider = defaultGridProvider,
    elevationAdapter = new ElevationAdapter()
  } = {}) {
    this.eligibilityService = eligibilityService;
    this.gridProvider = gridProvider;
    this.elevationAdapter = elevationAdapter;
  }

  resolveGrid(scene, explicitGrid) {
    const grid = explicitGrid
      ?? (typeof scene?.grid?.getOffset === "function" ? scene.grid : undefined)
      ?? this.gridProvider?.(scene);

    if (!grid || typeof grid !== "object") {
      throw new CoordinateAdapterError(
        "A live Foundry square-grid instance is required for coordinate conversion."
      );
    }
    for (const method of ["getOffset", "getCenterPoint", "getTopLeftPoint"]) {
      if (typeof grid[method] !== "function") {
        throw new CoordinateAdapterError(`The Foundry grid is missing public ${method}().`);
      }
    }
    return grid;
  }

  assertEligible(scene) {
    const eligibility = typeof this.eligibilityService.isEligible === "function"
      ? this.eligibilityService.isEligible(scene)
      : this.eligibilityService.evaluate(scene);
    if (!eligibility.eligible) {
      throw new CoordinateAdapterError(
        eligibility.reason?.message ?? "The Scene is not eligible for tactical coordinates.",
        { eligibility }
      );
    }
    return eligibility;
  }

  context(scene, explicitGrid) {
    this.assertEligible(scene);
    const grid = this.resolveGrid(scene, explicitGrid);
    const { sizeX, sizeY } = gridSize(grid);
    return { grid, sizeX, sizeY };
  }

  /**
   * Convert a placed TokenDocument into a derived tactical center anchor.
   * tacticalX/Y are measured in grid-cell units from the center of cell 0,0;
   * consequently a 1x1 token at the first cell is anchored at (0.5, 0.5),
   * while multi-cell centers may intentionally be half-grid values.
   */
  toTactical(token, scene, { grid: explicitGrid } = {}) {
    const { grid, sizeX, sizeY } = this.context(scene, explicitGrid);
    const data = tokenData(token);
    const topLeftOffsetValue = grid.getOffset({ x: data.x, y: data.y });
    const topLeftOffset = freezeOffset(topLeftOffsetValue.i, topLeftOffsetValue.j);
    if (!Number.isInteger(topLeftOffset.i) || !Number.isInteger(topLeftOffset.j)) {
      throw new CoordinateAdapterError("SquareGrid.getOffset did not return integer grid offsets.");
    }

    const canonicalTopLeft = pointFromGrid(
      "getTopLeftPoint",
      grid.getTopLeftPoint(topLeftOffset)
    );
    const firstCellCenter = pointFromGrid(
      "getCenterPoint",
      grid.getCenterPoint({ i: 0, j: 0 })
    );
    const anchor = freezePoint(
      data.x + data.width * sizeX / 2,
      data.y + data.height * sizeY / 2
    );
    const anchorTactical = freezePoint(
      (anchor.x - firstCellCenter.x) / sizeX + 0.5,
      (anchor.y - firstCellCenter.y) / sizeY + 0.5
    );
    const elevationMetadata = this.elevationAdapter.describe(data.elevation, grid.distance);

    return Object.freeze({
      tokenId: data.id,
      anchor,
      anchorTactical,
      centerX: anchor.x,
      centerY: anchor.y,
      tacticalX: anchorTactical.x,
      tacticalY: anchorTactical.y,
      elevation: elevationMetadata.elevation,
      tacticalZ: elevationMetadata.tacticalZ,
      elevationOnGrid: elevationMetadata.onGrid,
      elevationOffGrid: elevationMetadata.offGrid,
      offGrid: elevationMetadata.offGrid,
      elevationMetadata,
      topLeft: freezePoint(data.x, data.y),
      canonicalTopLeft: freezePoint(canonicalTopLeft.x, canonicalTopLeft.y),
      topLeftOffset,
      width: data.width,
      height: data.height
    });
  }

  toTacticalZ(elevation, sceneOrDistance) {
    return this.elevationAdapter.toTacticalZ(elevation, sceneOrDistance);
  }

  /**
   * Return the scene's square-grid line geometry in tactical cell units.
   * Grid origin and extent discovery remain here so renderers do not repeat
   * Foundry pixel/grid arithmetic.
   */
  getTopGrid(scene, { grid: explicitGrid } = {}) {
    const { grid } = this.context(scene, explicitGrid);
    const dimensions = scene?.dimensions && typeof scene.dimensions === "object"
      ? scene.dimensions
      : scene;
    const width = dimensions?.width;
    const height = dimensions?.height;
    if (!positiveNumber(width) || !positiveNumber(height)) {
      throw new CoordinateAdapterError("Scene dimensions must be positive for grid rendering.");
    }

    const origin = pointFromGrid(
      "getTopLeftPoint",
      grid.getTopLeftPoint({ i: 0, j: 0 })
    );
    const endOffset = grid.getOffset({
      x: origin.x + width - EPSILON,
      y: origin.y + height - EPSILON
    });
    const columns = Math.max(1, Math.floor(endOffset.i) + 1);
    const rows = Math.max(1, Math.floor(endOffset.j) + 1);

    return Object.freeze({
      columns,
      rows,
      verticalLines: Object.freeze(Array.from({ length: columns + 1 }, (_, i) => Object.freeze({
        x: i,
        fromY: 0,
        toY: rows
      }))),
      horizontalLines: Object.freeze(Array.from({ length: rows + 1 }, (_, j) => Object.freeze({
        y: j,
        fromX: 0,
        toX: columns
      })))
    });
  }

  toElevation(tacticalZ, sceneOrDistance) {
    return this.elevationAdapter.toElevation(tacticalZ, sceneOrDistance);
  }

  isElevationOnGrid(elevation, sceneOrDistance) {
    return this.elevationAdapter.isElevationOnGrid(elevation, sceneOrDistance);
  }

  moveElevationByTacticalDelta(elevation, deltaZ, sceneOrDistance) {
    return this.elevationAdapter.moveElevationByTacticalDelta(
      elevation,
      deltaZ,
      sceneOrDistance
    );
  }

  /**
   * Convert an absolute tactical anchor to a valid TokenDocument top-left.
   * No pixel origin is inferred here: the returned point comes from the
   * Foundry grid's public getTopLeftPoint method.
   */
  toTokenPosition(token, scene, tacticalAnchor, { grid: explicitGrid } = {}) {
    const { grid } = this.context(scene, explicitGrid);
    const data = tokenData(token);
    const x = tacticalAnchor?.x;
    const y = tacticalAnchor?.y;
    if (!finiteNumber(x) || !finiteNumber(y)) {
      throw new TypeError("A tactical anchor with finite x and y is required");
    }

    const topLeftOffset = {
      i: integerOffset(x - data.width / 2),
      j: integerOffset(y - data.height / 2)
    };
    const point = pointFromGrid(
      "getTopLeftPoint",
      grid.getTopLeftPoint(topLeftOffset)
    );
    return freezePoint(point.x, point.y);
  }

  /** Snap a candidate TokenDocument top-left through Foundry's public grid API. */
  snapTokenPosition(token, scene, topLeftPoint, { grid: explicitGrid } = {}) {
    const { grid } = this.context(scene, explicitGrid);
    if (!finiteNumber(topLeftPoint?.x) || !finiteNumber(topLeftPoint?.y)) {
      throw new TypeError("A finite token top-left point is required for snapping");
    }
    if (typeof grid.getSnappedPoint !== "function") {
      throw new CoordinateAdapterError("The Foundry grid is missing public getSnappedPoint().");
    }

    const mode = globalThis.CONST?.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER
      ?? DEFAULT_TOP_LEFT_SNAP_MODE;
    const snapped = grid.getSnappedPoint(
      { x: topLeftPoint.x, y: topLeftPoint.y },
      { mode }
    );
    const valid = pointFromGrid("getSnappedPoint", snapped);
    return freezePoint(valid.x, valid.y);
  }

  /** Snap a pointer-derived tactical center while preserving token footprint anchoring. */
  snapTacticalAnchor(token, scene, tacticalAnchor, { grid: explicitGrid } = {}) {
    const { grid, sizeX, sizeY } = this.context(scene, explicitGrid);
    const data = tokenData(token);
    if (!finiteNumber(tacticalAnchor?.x) || !finiteNumber(tacticalAnchor?.y)) {
      throw new TypeError("A finite tactical anchor is required for snapping");
    }

    const firstCellCenter = pointFromGrid(
      "getCenterPoint",
      grid.getCenterPoint({ i: 0, j: 0 })
    );
    const candidateTopLeft = {
      x: firstCellCenter.x + (tacticalAnchor.x - 0.5) * sizeX
        - data.width * sizeX / 2,
      y: firstCellCenter.y + (tacticalAnchor.y - 0.5) * sizeY
        - data.height * sizeY / 2
    };
    const position = this.snapTokenPosition(token, scene, candidateTopLeft, { grid });
    return Object.freeze({
      position,
      tacticalX: (position.x + data.width * sizeX / 2 - firstCellCenter.x) / sizeX + 0.5,
      tacticalY: (position.y + data.height * sizeY / 2 - firstCellCenter.y) / sizeY + 0.5
    });
  }

  /** Convert an integer tactical grid-step delta to a new token top-left. */
  moveByTacticalDelta(token, scene, delta, { grid: explicitGrid } = {}) {
    const current = this.toTactical(token, scene, { grid: explicitGrid });
    const dx = delta?.x ?? 0;
    const dy = delta?.y ?? 0;
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) {
      throw new TypeError("Tactical X/Y movement deltas must be integer grid steps");
    }
    return this.toTokenPosition(
      token,
      scene,
      { x: current.tacticalX + dx, y: current.tacticalY + dy },
      { grid: explicitGrid }
    );
  }
}
