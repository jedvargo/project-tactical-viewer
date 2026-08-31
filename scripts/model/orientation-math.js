import {
  ALLOWED_HEADINGS,
  ALLOWED_PITCHES
} from "../constants.js";

const FULL_TURN_DEGREES = 360;
const HEADING_STEP_DEGREES = 45;
const VECTOR_EPSILON = 1e-12;

function assertFiniteAngle(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

/** Normalize an angle to the tactical [0, 360) degree range. */
export function normalizeHeading(heading) {
  assertFiniteAngle(heading, "Heading");
  const normalized = heading % FULL_TURN_DEGREES;
  return Object.is(normalized, -0)
    ? 0
    : normalized < 0
      ? normalized + FULL_TURN_DEGREES
      : normalized;
}

/** Snap any heading to the nearest approved 45-degree tactical heading. */
export function snapHeading(heading) {
  const normalized = normalizeHeading(heading);
  const snapped = Math.round(normalized / HEADING_STEP_DEGREES) * HEADING_STEP_DEGREES;
  return snapped === FULL_TURN_DEGREES ? 0 : snapped;
}

export function isSupportedHeading(heading) {
  return typeof heading === "number" && ALLOWED_HEADINGS.includes(heading);
}

export function isSupportedPitch(pitch) {
  return typeof pitch === "number" && Number.isFinite(pitch) &&
    ALLOWED_PITCHES.includes(pitch);
}

/** Snap pitch to the nearest supported tactical pitch, clamping at +/-90. */
export function snapPitch(pitch) {
  assertFiniteAngle(pitch, "Pitch");
  return ALLOWED_PITCHES.reduce((nearest, candidate) => {
    const candidateDelta = Math.abs(candidate - pitch);
    const nearestDelta = Math.abs(nearest - pitch);
    return candidateDelta < nearestDelta ? candidate : nearest;
  });
}

/** Normalize a pitch into the five-value tactical vocabulary. */
export function normalizePitch(pitch) {
  return snapPitch(pitch);
}

function cleanVectorComponent(value) {
  if (Math.abs(value) < VECTOR_EPSILON) return 0;
  if (Math.abs(value - 1) < VECTOR_EPSILON) return 1;
  if (Math.abs(value + 1) < VECTOR_EPSILON) return -1;
  return value;
}

/**
 * Return the canonical tactical orientation vector for heading and pitch in
 * degrees. Heading is normalized and pitch is snapped to the supported values
 * before applying the documented tactical-axis formula.
 */
export function orientationVector(heading, pitch) {
  const headingRadians = normalizeHeading(heading) * Math.PI / 180;
  const pitchRadians = normalizePitch(pitch) * Math.PI / 180;
  const horizontalScale = Math.cos(pitchRadians);

  return Object.freeze({
    dx: cleanVectorComponent(Math.sin(headingRadians) * horizontalScale),
    dy: cleanVectorComponent(-Math.cos(headingRadians) * horizontalScale),
    dz: cleanVectorComponent(Math.sin(pitchRadians))
  });
}
