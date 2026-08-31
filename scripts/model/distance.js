function assertFiniteDelta(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number`);
  }
}

/** Return cubic tactical distance for a 3D delta. */
export function chebyshevDistance3d(dx, dy, dz) {
  assertFiniteDelta(dx, "dx");
  assertFiniteDelta(dy, "dy");
  assertFiniteDelta(dz, "dz");
  return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
}
