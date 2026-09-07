import { describe, expect, it } from "vitest";

import {
  ALLOWED_HEADINGS,
  ALLOWED_PITCHES,
  MODULE_ID,
  PERSISTENT_SCHEMA_VERSION,
  TACTICAL_AXIS_CONVENTION,
  VIEW_DEFINITIONS
} from "../../scripts/constants.js";

describe("shared tactical constants", () => {
  it("defines the module identity and persistent schema", () => {
    expect(MODULE_ID).toBe("tactical-3d-viewer");
    expect(PERSISTENT_SCHEMA_VERSION).toBe(2);
  });

  it("defines the approved heading and pitch values", () => {
    expect(ALLOWED_HEADINGS).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(ALLOWED_PITCHES).toEqual([90, 45, 0, -45, -90]);
  });

  it("defines the canonical tactical axes", () => {
    expect(TACTICAL_AXIS_CONVENTION).toEqual({
      x: "east",
      y: "south",
      z: "up"
    });
  });

  it("defines the fixed views in the specification order", () => {
    expect(VIEW_DEFINITIONS).toEqual([
      { id: "top", name: "Top" },
      { id: "bottom", name: "Bottom" },
      { id: "left", name: "Left" },
      { id: "right", name: "Right" },
      { id: "front", name: "Front" },
      { id: "back", name: "Back" },
      { id: "isometric", name: "Isometric" }
    ]);
  });
});
