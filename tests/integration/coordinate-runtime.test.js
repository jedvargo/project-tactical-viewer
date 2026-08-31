import { describe, expect, it } from "vitest";

import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import {
  createFakeSquareGrid,
  makeSquareScene,
  makeToken
} from "../helpers/fake-grid.js";

describe("Prompt 04 coordinate runtime integration", () => {
  it("registers the adapter and routes diagnostic tactical state through it", () => {
    const grid = createFakeSquareGrid({ originX: 50, originY: 75 });
    const coordinateAdapter = new CoordinateAdapter();
    const runtime = createRuntime({ coordinateAdapter });
    const api = createModuleApi(runtime);
    const scene = makeSquareScene(grid);
    const token = makeToken({
      x: 250,
      y: 375,
      width: 2,
      height: 2,
      id: "ship"
    });

    expect(runtime.getService("coordinateAdapter")).toBe(coordinateAdapter);
    expect(api.getTacticalState(token, scene)).toMatchObject({
      tokenId: "ship",
      centerX: 350,
      centerY: 475,
      tacticalX: 3,
      tacticalY: 4,
      anchorTactical: { x: 3, y: 4 }
    });
  });
});
