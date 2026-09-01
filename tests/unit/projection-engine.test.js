import { describe, expect, it } from "vitest";

import { orientationVector } from "../../scripts/model/orientation-math.js";
import { ProjectionEngine } from "../../scripts/projection/projection-engine.js";

const engine = new ProjectionEngine();

function camera(view, overrides = {}) {
  return {
    view,
    focus: { x: 1, y: 2, z: 3 },
    scale: 10,
    screenCenter: { x: 100, y: 200 },
    ...overrides
  };
}

describe("ProjectionEngine orthographic views", () => {
  it("projects hand-authored points using each documented view basis", () => {
    const point = { x: 2, y: 4, z: 5 };

    expect(engine.projectPoint(point, camera("top"))).toEqual({ x: 110, y: 180 });
    expect(engine.projectPoint(point, camera("north"))).toEqual({ x: 110, y: 180 });
    expect(engine.projectPoint(point, camera("south"))).toEqual({ x: 90, y: 220 });
    expect(engine.projectPoint(point, camera("east"))).toEqual({ x: 120, y: 220 });
    expect(engine.projectPoint(point, camera("west"))).toEqual({ x: 80, y: 220 });
  });

  it("describes visible, hidden, mirrored, and labeled axes explicitly", () => {
    expect(engine.describe("top")).toMatchObject({
      visibleAxes: ["x", "y"],
      hiddenAxis: "z",
      horizontal: { axis: "x", sign: 1 },
      vertical: { axis: "y", sign: -1 },
      screenUp: { axis: "y", sign: -1 },
      labels: { horizontal: "+X East", vertical: "-Y North", hidden: "Z Up" }
    });
    expect(engine.describe("north")).toMatchObject({
      visibleAxes: ["x", "z"],
      hiddenAxis: "y",
      screenUp: { axis: "z", sign: -1 }
    });
    expect(engine.describe("south")).toMatchObject({
      visibleAxes: ["x", "z"],
      hiddenAxis: "y",
      mirroredAxis: "horizontal",
      horizontal: { axis: "x", sign: -1 }
    });
    expect(engine.describe("east")).toMatchObject({
      visibleAxes: ["y", "z"],
      hiddenAxis: "x",
      horizontal: { axis: "y", sign: 1 }
    });
    expect(engine.describe("west")).toMatchObject({
      visibleAxes: ["y", "z"],
      hiddenAxis: "x",
      mirroredAxis: "horizontal",
      horizontal: { axis: "y", sign: -1 }
    });
  });

  it("round-trips visible axes while preserving the supplied hidden coordinate", () => {
    const point = { x: -4, y: 6, z: -8 };

    for (const view of ["top", "north", "south", "east", "west"]) {
      const viewCamera = camera(view, {
        focus: { x: 10, y: -2, z: 3 },
        scale: 4,
        screenCenter: { x: 0, y: 0 }
      });
      const screenPoint = engine.projectPoint(point, viewCamera);
      expect(engine.inversePoint(screenPoint, viewCamera, { preserve: point })).toEqual(point);
    }
  });

  it("keeps the camera focus hidden coordinate when no explicit preservation point is given", () => {
    const viewCamera = camera("north");
    const screenPoint = engine.projectPoint({ x: 4, y: 99, z: 7 }, viewCamera);

    expect(engine.inversePoint(screenPoint, viewCamera)).toEqual({ x: 4, y: 2, z: 7 });
  });

  it("projects orientation vectors through the same five view bases", () => {
    const vector = { dx: 1, dy: 2, dz: 3 };
    const viewCamera = (view) => camera(view, { scale: 2, screenCenter: { x: 0, y: 0 } });

    expect(engine.projectVector(vector, viewCamera("top"))).toEqual({ x: 2, y: -4 });
    expect(engine.projectVector(vector, viewCamera("north"))).toEqual({ x: 2, y: -6 });
    expect(engine.projectVector(vector, viewCamera("south"))).toEqual({ x: -2, y: 6 });
    expect(engine.projectVector(vector, viewCamera("east"))).toEqual({ x: 4, y: 6 });
    expect(engine.projectVector(vector, viewCamera("west"))).toEqual({ x: -4, y: 6 });
  });

  it("returns finite point and orientation projections at negative coordinates", () => {
    const point = { x: -1000, y: -2000, z: -3000 };

    for (const view of ["top", "north", "south", "east", "west"]) {
      const projectedPoint = engine.projectPoint(point, camera(view));
      expect(Number.isFinite(projectedPoint.x)).toBe(true);
      expect(Number.isFinite(projectedPoint.y)).toBe(true);

      for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const pitch of [90, 45, 0, -45, -90]) {
          const projectedVector = engine.projectVector(
            orientationVector(heading, pitch),
            camera(view)
          );
          expect(Number.isFinite(projectedVector.x)).toBe(true);
          expect(Number.isFinite(projectedVector.y)).toBe(true);
        }
      }
    }
  });
});

describe("ProjectionEngine fixed isometric views", () => {
  const isoViews = ["iso-ne", "iso-se", "iso-sw", "iso-nw"];
  const isoCamera = (view, overrides = {}) => camera(view, {
    focus: { x: 0, y: 0, z: 0 },
    scale: 1,
    screenCenter: { x: 0, y: 0 },
    ...overrides
  });
  const rootHalf = Math.SQRT1_2;
  const rootSixth = 1 / Math.sqrt(6);
  const rootTwoThirds = Math.sqrt(2 / 3);
  const expectProjection = (actual, expected) => {
    expect(actual.x).toBeCloseTo(expected.x, 12);
    expect(actual.y).toBeCloseTo(expected.y, 12);
  };

  it("projects the origin and each positive world axis with explicit camera bases", () => {
    const expected = {
      "iso-ne": {
        origin: { x: 0, y: 0 },
        x: { x: rootHalf, y: -rootSixth },
        y: { x: rootHalf, y: rootSixth },
        z: { x: 0, y: rootTwoThirds }
      },
      "iso-se": {
        origin: { x: 0, y: 0 },
        x: { x: -rootHalf, y: -rootSixth },
        y: { x: rootHalf, y: -rootSixth },
        z: { x: 0, y: rootTwoThirds }
      },
      "iso-sw": {
        origin: { x: 0, y: 0 },
        x: { x: -rootHalf, y: rootSixth },
        y: { x: -rootHalf, y: -rootSixth },
        z: { x: 0, y: rootTwoThirds }
      },
      "iso-nw": {
        origin: { x: 0, y: 0 },
        x: { x: rootHalf, y: rootSixth },
        y: { x: -rootHalf, y: rootSixth },
        z: { x: 0, y: rootTwoThirds }
      }
    };

    for (const view of isoViews) {
      expect(engine.projectPoint({ x: 0, y: 0, z: 0 }, isoCamera(view))).toEqual(
        expected[view].origin
      );
      expectProjection(
        engine.projectPoint({ x: 1, y: 0, z: 0 }, isoCamera(view)),
        expected[view].x
      );
      expectProjection(
        engine.projectPoint({ x: 0, y: 1, z: 0 }, isoCamera(view)),
        expected[view].y
      );
      expectProjection(
        engine.projectPoint({ x: 0, y: 0, z: 1 }, isoCamera(view)),
        expected[view].z
      );
    }
  });

  it("keeps the four cameras symmetric around the tactical axes", () => {
    const point = { x: 2, y: 3, z: 4 };
    const projections = Object.fromEntries(
      isoViews.map((view) => [view, engine.projectPoint(point, isoCamera(view))])
    );

    expect(projections["iso-ne"].x).toBeCloseTo((point.x + point.y) * rootHalf);
    expect(projections["iso-se"].x).toBeCloseTo((-point.x + point.y) * rootHalf);
    expect(projections["iso-sw"].x).toBeCloseTo((-point.x - point.y) * rootHalf);
    expect(projections["iso-nw"].x).toBeCloseTo((point.x - point.y) * rootHalf);
    expect(projections["iso-ne"].y).toBeCloseTo((-point.x + point.y + 2 * point.z) * rootSixth);
    expect(projections["iso-se"].y).toBeCloseTo((-point.x - point.y + 2 * point.z) * rootSixth);
    expect(projections["iso-sw"].y).toBeCloseTo((point.x - point.y + 2 * point.z) * rootSixth);
    expect(projections["iso-nw"].y).toBeCloseTo((point.x + point.y + 2 * point.z) * rootSixth);
  });

  it("projects every heading and pitch orientation into finite screen vectors", () => {
    for (const view of isoViews) {
      for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
        for (const pitch of [90, 45, 0, -45, -90]) {
          const projected = engine.projectOrientationVector(
            orientationVector(heading, pitch),
            isoCamera(view, { scale: 20 })
          );
          expect(Number.isFinite(projected.x)).toBe(true);
          expect(Number.isFinite(projected.y)).toBe(true);
        }
      }
    }
  });

  it("orders known far and near points using each camera's outward depth basis", () => {
    const nearByView = {
      "iso-ne": { x: 3, y: -2, z: 4 },
      "iso-se": { x: 3, y: 2, z: 4 },
      "iso-sw": { x: -3, y: 2, z: 4 },
      "iso-nw": { x: -3, y: -2, z: 4 }
    };

    for (const view of isoViews) {
      const near = nearByView[view];
      const far = { x: -near.x, y: -near.y, z: -near.z };
      expect(engine.depthKey(near, isoCamera(view))).toBeGreaterThan(
        engine.depthKey(far, isoCamera(view))
      );
      expect(engine.sortByDepth([
        { id: "near", point: near },
        { id: "far", point: far }
      ], isoCamera(view)).map(({ id }) => id)).toEqual(["far", "near"]);
    }
  });

  it("uses token IDs as a deterministic equal-depth tie-breaker and preserves no-ID order", () => {
    const viewCamera = isoCamera("iso-ne");
    const equalDepth = [
      { id: "zulu", point: { x: 1, y: 0, z: 0 } },
      { id: "alpha", point: { x: 0, y: -1, z: 0 } }
    ];

    expect(engine.sortByDepth(equalDepth, viewCamera).map(({ id }) => id)).toEqual([
      "alpha",
      "zulu"
    ]);
    expect(engine.sortByDepth([
      { point: equalDepth[0].point },
      { point: equalDepth[1].point }
    ], viewCamera).map((item) => item.point)).toEqual([
      equalDepth[0].point,
      equalDepth[1].point
    ]);
  });

  it("does not expose an inverse mapping for fixed isometric cameras", () => {
    expect(() => engine.inversePoint(
      { x: 0, y: 0 },
      isoCamera("iso-ne")
    )).toThrow("Inverse projection is unavailable for isometric views");
  });
});
