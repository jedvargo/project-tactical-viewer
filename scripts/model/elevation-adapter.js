/**
 * Absolute tolerance used when deciding whether a derived tactical Z is on a
 * grid level. The comparison scales by the magnitude of tactical Z so normal
 * floating-point residue is accepted without treating a meaningful fraction
 * of a level as aligned.
 */
export const ELEVATION_TOLERANCE = 1e-9;

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assertFinite(value, name) {
  if (!finiteNumber(value)) {
    throw new ElevationAdapterError(`${name} must be a finite number.`);
  }
}

function assertGridDistance(gridDistance) {
  if (!finiteNumber(gridDistance) || gridDistance <= 0) {
    throw new ElevationAdapterError("A positive grid distance is required.");
  }
}

function resolveGridDistance(sceneOrDistance) {
  const gridDistance = typeof sceneOrDistance === "number"
    ? sceneOrDistance
    : sceneOrDistance?.grid?.distance ?? sceneOrDistance?.distance;
  assertGridDistance(gridDistance);
  return gridDistance;
}

function cleanZero(value) {
  return value === 0 ? 0 : value;
}

/** Error raised when an elevation conversion cannot be performed safely. */
export class ElevationAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "ElevationAdapterError";
  }
}

/** Convert Foundry Scene-distance elevation units to tactical grid levels. */
export function elevationToTacticalZ(elevation, sceneOrDistance) {
  assertFinite(elevation, "Elevation");
  const gridDistance = resolveGridDistance(sceneOrDistance);
  return cleanZero(elevation / gridDistance);
}

/** Convert tactical grid levels to Foundry Scene-distance elevation units. */
export function tacticalZToElevation(tacticalZ, sceneOrDistance) {
  assertFinite(tacticalZ, "Tactical Z");
  const gridDistance = resolveGridDistance(sceneOrDistance);
  return cleanZero(tacticalZ * gridDistance);
}

/**
 * Describe an elevation without changing the source value.
 * `onGrid` is true when the nearest integer tactical Z is within
 * ELEVATION_TOLERANCE * max(1, abs(tacticalZ)); this is the documented
 * floating-point tolerance for level detection.
 */
export function describeElevation(elevation, sceneOrDistance, {
  tolerance = ELEVATION_TOLERANCE
} = {}) {
  assertFinite(elevation, "Elevation");
  if (!finiteNumber(tolerance) || tolerance < 0) {
    throw new ElevationAdapterError("Elevation tolerance must be a non-negative finite number.");
  }

  const gridDistance = resolveGridDistance(sceneOrDistance);
  const tacticalZ = elevationToTacticalZ(elevation, gridDistance);
  const nearestTacticalZ = Math.round(tacticalZ);
  const levelTolerance = tolerance * Math.max(1, Math.abs(tacticalZ));
  const onGrid = Math.abs(tacticalZ - nearestTacticalZ) <= levelTolerance;

  return Object.freeze({
    elevation,
    tacticalZ,
    gridDistance,
    onGrid,
    offGrid: !onGrid,
    nearestTacticalZ,
    nearestElevation: tacticalZToElevation(nearestTacticalZ, gridDistance),
    tolerance: levelTolerance
  });
}

/**
 * Apply an explicit tactical vertical action without mutating a document.
 * An off-step starting elevation is first snapped to its nearest level
 * (Math.round's tie behavior deliberately chooses the level toward +Z), then
 * the integer tactical delta is applied. Thus 7.5 at distance 5 moved up one
 * level becomes 15, while moved down one level becomes 5.
 */
export function moveElevationByTacticalDelta(elevation, deltaZ, sceneOrDistance, options) {
  assertFinite(elevation, "Elevation");
  if (!Number.isInteger(deltaZ)) {
    throw new TypeError("Tactical Z movement deltas must be integer grid steps.");
  }

  const description = describeElevation(elevation, sceneOrDistance, options);
  return tacticalZToElevation(description.nearestTacticalZ + deltaZ, description.gridDistance);
}

export class ElevationAdapter {
  constructor({ tolerance = ELEVATION_TOLERANCE } = {}) {
    if (!finiteNumber(tolerance) || tolerance < 0) {
      throw new ElevationAdapterError("Elevation tolerance must be a non-negative finite number.");
    }
    this.tolerance = tolerance;
  }

  toTacticalZ(elevation, sceneOrDistance) {
    return elevationToTacticalZ(elevation, sceneOrDistance);
  }

  toElevation(tacticalZ, sceneOrDistance) {
    return tacticalZToElevation(tacticalZ, sceneOrDistance);
  }

  describe(elevation, sceneOrDistance) {
    return describeElevation(elevation, sceneOrDistance, { tolerance: this.tolerance });
  }

  isElevationOnGrid(elevation, sceneOrDistance) {
    return this.describe(elevation, sceneOrDistance).onGrid;
  }

  moveElevationByTacticalDelta(elevation, deltaZ, sceneOrDistance) {
    return moveElevationByTacticalDelta(elevation, deltaZ, sceneOrDistance, {
      tolerance: this.tolerance
    });
  }
}
