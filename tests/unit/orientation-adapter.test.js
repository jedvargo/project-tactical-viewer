import { describe, expect, it } from "vitest";

import { ALLOWED_HEADINGS } from "../../scripts/constants.js";
import { OrientationAdapter } from "../../scripts/model/orientation-adapter.js";

describe("OrientationAdapter", () => {
  const adapter = new OrientationAdapter();

  it("matches Foundry's documented south-facing rotation convention", () => {
    expect(adapter.foundryRotationToHeading(0)).toBe(180);
    expect(adapter.foundryRotationToHeading(90)).toBe(270);
    expect(adapter.foundryRotationToHeading(180)).toBe(0);
    expect(adapter.foundryRotationToHeading(270)).toBe(90);
  });

  it("round-trips all tactical headings through Foundry rotation", () => {
    for (const heading of ALLOWED_HEADINGS) {
      const rotation = adapter.headingToFoundryRotation(heading);
      expect(adapter.foundryRotationToHeading(rotation)).toBe(heading);
    }
  });

  it("normalizes arbitrary rotations without silently snapping them", () => {
    expect(adapter.foundryRotationToHeading(-90)).toBe(90);
    expect(adapter.foundryRotationToHeading(450)).toBe(270);
    expect(adapter.headingToFoundryRotation(10)).toBe(190);
  });

  it("provides the canonical vector through the same boundary", () => {
    expect(adapter.orientationVector(90, 0)).toEqual({ dx: 1, dy: 0, dz: 0 });
  });
});
