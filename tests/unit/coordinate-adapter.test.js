import { describe, expect, it, vi } from "vitest";

import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import {
  createFakeSquareGrid,
  makeSquareScene,
  makeToken
} from "../helpers/fake-grid.js";

function makeFixture({ i, j, width, height, grid }) {
  return {
    scene: makeSquareScene(grid),
    token: makeToken({
      x: grid.getTopLeftPoint({ i, j }).x,
      y: grid.getTopLeftPoint({ i, j }).y,
      width,
      height,
      id: `${width}x${height}-${i}-${j}`
    })
  };
}

describe("CoordinateAdapter", () => {
  it.each([
    [{ i: 0, j: 0, width: 1, height: 1 }, { x: 0.5, y: 0.5 }],
    [{ i: 2, j: 3, width: 2, height: 2 }, { x: 3, y: 4 }],
    [{ i: 1, j: 4, width: 3, height: 2 }, { x: 2.5, y: 5 }],
    [{ i: 5, j: 1, width: 1, height: 3 }, { x: 5.5, y: 2.5 }]
  ])("derives the center anchor for a %dx%d footprint", (fixture, expected) => {
    const grid = createFakeSquareGrid({ originX: 40, originY: 60 });
    const { scene, token } = makeFixture({ ...fixture, grid });
    const adapter = new CoordinateAdapter();

    const state = adapter.toTactical(token, scene);

    expect(state.anchor).toEqual({
      x: token.x + fixture.width * grid.sizeX / 2,
      y: token.y + fixture.height * grid.sizeY / 2
    });
    expect(state.tacticalX).toBe(expected.x);
    expect(state.tacticalY).toBe(expected.y);
    expect(state.topLeftOffset).toEqual({ i: fixture.i, j: fixture.j });
  });

  it("uses the grid API for a padded Scene instead of assuming pixel origin 0,0", () => {
    const grid = createFakeSquareGrid({ originX: 125, originY: 275 });
    const scene = makeSquareScene(grid);
    const token = makeToken({ x: 425, y: 575, width: 1, height: 1 });
    const adapter = new CoordinateAdapter();

    const state = adapter.toTactical(token, scene);

    expect(state.tacticalX).toBe(3.5);
    expect(state.tacticalY).toBe(3.5);
    expect(state.anchor).toEqual({ x: 475, y: 625 });
    expect(grid.calls.getOffset).toContainEqual({ x: 425, y: 575 });
    expect(grid.calls.getTopLeftPoint).toContainEqual({ i: 3, j: 3 });
    expect(grid.calls.getCenterPoint).toContainEqual({ i: 0, j: 0 });
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [1, 3]
  ])("moves a %dx%d token anchor by exactly one grid cell", (width, height) => {
    const grid = createFakeSquareGrid({ originX: 80, originY: 120 });
    const scene = makeSquareScene(grid);
    const token = makeToken({
      x: grid.getTopLeftPoint({ i: 4, j: 5 }).x,
      y: grid.getTopLeftPoint({ i: 4, j: 5 }).y,
      width,
      height
    });
    const adapter = new CoordinateAdapter();
    const before = adapter.toTactical(token, scene);
    const nextPosition = adapter.moveByTacticalDelta(token, scene, { x: 1, y: 1 });
    const after = adapter.toTactical({ ...token, ...nextPosition }, scene);

    expect(nextPosition).toEqual({ x: token.x + grid.size, y: token.y + grid.size });
    expect(after.tacticalX - before.tacticalX).toBe(1);
    expect(after.tacticalY - before.tacticalY).toBe(1);
    expect(after.width).toBe(width);
    expect(after.height).toBe(height);
  });

  it("round-trips the anchor without accumulating drift near a Scene boundary", () => {
    const grid = createFakeSquareGrid({ originX: 37, originY: 91 });
    const scene = makeSquareScene(grid);
    const token = makeToken({
      x: grid.getTopLeftPoint({ i: 10, j: 8 }).x,
      y: grid.getTopLeftPoint({ i: 10, j: 8 }).y,
      width: 3,
      height: 2
    });
    const adapter = new CoordinateAdapter();
    const original = adapter.toTactical(token, scene);
    let position = { x: token.x, y: token.y };

    for (let index = 0; index < 20; index += 1) {
      position = adapter.toTokenPosition(token, scene, original.anchorTactical);
    }

    expect(position).toEqual({ x: token.x, y: token.y });
    expect(adapter.toTactical({ ...token, ...position }, scene).anchorTactical).toEqual(
      original.anchorTactical
    );
  });

  it("rejects an invalid or non-square Scene through SceneEligibilityService", () => {
    const grid = createFakeSquareGrid();
    const adapter = new CoordinateAdapter();
    const token = makeToken({ x: 0, y: 0 });

    expect(() => adapter.toTactical(token, makeSquareScene({
      ...grid,
      type: "hexagonal"
    }))).toThrowError(/hexagonal Scenes are unsupported/);
    expect(() => adapter.toTactical(token, {
      grid: { type: "gridless", size: 0, distance: 0 },
      dimensions: { width: 100, height: 100 }
    })).toThrowError(/gridless Scenes/);
    expect(() => adapter.toTactical(token, {
      grid: { type: "square", size: 100, sizeX: 100, sizeY: 120, distance: 5 },
      dimensions: { width: 100, height: 100 }
    })).toThrowError(/positive grid pixel size/);
  });

  it.each([1, 5, 10, 100])("converts elevation to tactical Z at grid distance %d", (distance) => {
    const grid = createFakeSquareGrid({ distance });
    const scene = makeSquareScene(grid);
    const adapter = new CoordinateAdapter();
    const token = makeToken({ x: 0, y: 0, elevation: -2 * distance });

    expect(adapter.toTactical(token, scene)).toMatchObject({
      elevation: -2 * distance,
      tacticalZ: -2,
      elevationOnGrid: true,
      elevationOffGrid: false
    });
  });

  it.each([
    [-10, 5, -2],
    [0, 5, 0],
    [15, 5, 3],
    [7.5, 5, 1.5]
  ])("preserves elevation %d and reports tactical Z %d at distance %d", (elevation, distance, tacticalZ) => {
    const grid = createFakeSquareGrid({ distance });
    const scene = makeSquareScene(grid);
    const adapter = new CoordinateAdapter();
    const token = makeToken({ x: 0, y: 0, elevation });

    const state = adapter.toTactical(token, scene);

    expect(state.elevation).toBe(elevation);
    expect(state.tacticalZ).toBe(tacticalZ);
    expect(state.elevationMetadata).toMatchObject({
      gridDistance: distance,
      onGrid: elevation % distance === 0,
      offGrid: elevation % distance !== 0
    });
  });

  it("converts tactical Z back to Foundry elevation without losing negative values", () => {
    const adapter = new CoordinateAdapter();

    expect(adapter.toElevation(-3, 5)).toBe(-15);
    expect(adapter.toElevation(0, 10)).toBe(0);
    expect(adapter.toElevation(2.5, 100)).toBe(250);
  });

  it("round-trips on-grid elevations across all supported grid distances", () => {
    const adapter = new CoordinateAdapter();

    for (const distance of [1, 5, 10, 100]) {
      for (const tacticalZ of [-7, 0, 4, 12]) {
        const elevation = tacticalZ * distance;
        expect(adapter.toElevation(adapter.toTacticalZ(elevation, distance), distance))
          .toBe(tacticalZ * distance);
      }
    }
  });

  it("treats floating-point residue within the documented tolerance as on-grid", () => {
    const grid = createFakeSquareGrid({ distance: 5 });
    const scene = makeSquareScene(grid);
    const adapter = new CoordinateAdapter();
    const token = makeToken({ x: 0, y: 0, elevation: 15 + 1e-10 });

    expect(adapter.toTactical(token, scene).elevationOnGrid).toBe(true);
  });

  it("does not rewrite an off-grid document when reading tactical state", () => {
    const grid = createFakeSquareGrid({ distance: 5 });
    const scene = makeSquareScene(grid);
    const token = makeToken({ x: 0, y: 0, elevation: 7.5 });
    token.update = vi.fn();
    const adapter = new CoordinateAdapter();

    const state = adapter.toTactical(token, scene);

    expect(state.elevationOffGrid).toBe(true);
    expect(token.elevation).toBe(7.5);
    expect(token.update).not.toHaveBeenCalled();
  });

  it("snaps an off-step starting elevation before applying a tactical vertical move", () => {
    const adapter = new CoordinateAdapter();

    expect(adapter.moveElevationByTacticalDelta(7.5, 1, 5)).toBe(15);
    expect(adapter.moveElevationByTacticalDelta(7.5, -1, 5)).toBe(5);
    expect(adapter.moveElevationByTacticalDelta(-7.5, 1, 5)).toBe(0);
  });

  it("rejects non-positive grid distance for every elevation conversion", () => {
    const adapter = new CoordinateAdapter();

    expect(() => adapter.toTacticalZ(1, 0)).toThrowError(/positive grid distance/);
    expect(() => adapter.toElevation(1, -5)).toThrowError(/positive grid distance/);
    expect(() => adapter.isElevationOnGrid(1, Number.NaN)).toThrowError(/positive grid distance/);
  });
});
