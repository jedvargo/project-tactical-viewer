/**
 * Shared, immutable values that define the public v1 tactical vocabulary.
 * This module deliberately has no Foundry dependency.
 */
export const MODULE_ID = "tactical-3d-viewer";

export const CURRENT_SCHEMA_VERSION = 2;
export const PERSISTENT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

export const ALLOWED_HEADINGS = Object.freeze([
  0, 45, 90, 135, 180, 225, 270, 315
]);

export const ALLOWED_PITCHES = Object.freeze([90, 45, 0, -45, -90]);

export const TACTICAL_AXIS_CONVENTION = Object.freeze({
  x: "east",
  y: "south",
  z: "up"
});

export const TACTICAL_AXES = TACTICAL_AXIS_CONVENTION;

export const VIEW_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "top", name: "Top" }),
  Object.freeze({ id: "bottom", name: "Bottom" }),
  Object.freeze({ id: "left", name: "Left" }),
  Object.freeze({ id: "right", name: "Right" }),
  Object.freeze({ id: "front", name: "Front" }),
  Object.freeze({ id: "back", name: "Back" }),
  Object.freeze({ id: "isometric", name: "Isometric" })
]);

/** IDs used by the original compass-based view vocabulary. */
export const VIEW_ID_ALIASES = Object.freeze({
  north: "front",
  south: "back",
  east: "right",
  west: "left",
  "iso-ne": "isometric",
  "iso-se": "isometric",
  "iso-sw": "isometric",
  "iso-nw": "isometric"
});

export function canonicalViewId(view) {
  return VIEW_ID_ALIASES[view] ?? view;
}
