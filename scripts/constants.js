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
  Object.freeze({ id: "north", name: "North" }),
  Object.freeze({ id: "south", name: "South" }),
  Object.freeze({ id: "east", name: "East" }),
  Object.freeze({ id: "west", name: "West" }),
  Object.freeze({ id: "iso-ne", name: "Isometric NE" }),
  Object.freeze({ id: "iso-se", name: "Isometric SE" }),
  Object.freeze({ id: "iso-sw", name: "Isometric SW" }),
  Object.freeze({ id: "iso-nw", name: "Isometric NW" })
]);
