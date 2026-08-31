import { SceneEligibilityService } from "../scene-eligibility.js";
import { ElevationAdapter } from "./elevation-adapter.js";

const EPSILON = 1e-9;

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
