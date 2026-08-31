import { describe, expect, it } from "vitest";

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
});
