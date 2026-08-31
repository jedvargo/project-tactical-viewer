import { describe, expect, it } from "vitest";

import {
  ALLOWED_HEADINGS,
  ALLOWED_PITCHES
} from "../../scripts/constants.js";
import {
  isSupportedPitch,
  normalizeHeading,
  normalizePitch,
  orientationVector,
  snapHeading,
  snapPitch
} from "../../scripts/model/orientation-math.js";
import { chebyshevDistance3d } from "../../scripts/model/distance.js";

describe("tactical orientation math", () => {
  it("normalizes headings into one turn and snaps to the nearest 45 degrees", () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(-45)).toBe(315);
    expect(normalizeHeading(725)).toBe(5);

    expect(ALLOWED_HEADINGS.map((heading) => snapHeading(heading))).toEqual(
      ALLOWED_HEADINGS
    );
    expect(snapHeading(22.4)).toBe(0);
    expect(snapHeading(22.5)).toBe(45);
    expect(snapHeading(-46)).toBe(315);
  });

  it("validates and snaps pitches to the five supported values", () => {
    expect(ALLOWED_PITCHES.every((pitch) => isSupportedPitch(pitch))).toBe(true);
    expect(isSupportedPitch(30)).toBe(false);
    expect(normalizePitch(45)).toBe(45);
    expect(normalizePitch(44)).toBe(45);
    expect(snapPitch(22)).toBe(0);
    expect(snapPitch(-70)).toBe(-90);
    expect(snapPitch(100)).toBe(90);
  });

  it("produces finite vectors for every heading and pitch combination", () => {
    for (const heading of ALLOWED_HEADINGS) {
      for (const pitch of ALLOWED_PITCHES) {
        const vector = orientationVector(heading, pitch);
        expect(Object.values(vector).every(Number.isFinite)).toBe(true);
      }
    }
  });

  it("matches the cardinal and vertical vector truth table", () => {
    expect(orientationVector(0, 0)).toEqual({ dx: 0, dy: -1, dz: 0 });
    expect(orientationVector(90, 0)).toEqual({ dx: 1, dy: 0, dz: 0 });
    expect(orientationVector(180, 0)).toEqual({ dx: 0, dy: 1, dz: 0 });
    expect(orientationVector(270, 0)).toEqual({ dx: -1, dy: 0, dz: 0 });
    expect(orientationVector(45, 90)).toEqual({ dx: 0, dy: 0, dz: 1 });
    expect(orientationVector(315, -90)).toEqual({ dx: 0, dy: 0, dz: -1 });
  });

  it("retains heading as an independent input at vertical pitch", () => {
    expect(orientationVector(0, 90)).toEqual(orientationVector(180, 90));
    expect(orientationVector(0, -90)).toEqual(orientationVector(180, -90));
  });
});

describe("3D tactical distance", () => {
  it("uses the greatest absolute axis delta", () => {
    expect(chebyshevDistance3d(3, 0, 0)).toBe(3);
    expect(chebyshevDistance3d(0, -4, 0)).toBe(4);
    expect(chebyshevDistance3d(0, 0, 5)).toBe(5);
    expect(chebyshevDistance3d(2, 2, 0)).toBe(2);
    expect(chebyshevDistance3d(-3, 4, -5)).toBe(5);
    expect(chebyshevDistance3d(0, 0, 0)).toBe(0);
  });
});
