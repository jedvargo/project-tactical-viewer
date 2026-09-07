import { describe, expect, it, vi } from "vitest";

import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { OrientationAdapter } from "../../scripts/model/orientation-adapter.js";
import { buildTacticalTokenState } from "../../scripts/model/tactical-token-state.js";
import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { MODULE_ID } from "../../scripts/constants.js";
import {
  createFakeSquareGrid,
  makeSquareScene
} from "../helpers/fake-grid.js";

function makeDocument({
  id = "placed",
  x = 100,
  y = 200,
  width = 1,
  height = 1,
  depth,
  elevation = 0,
  rotation = 180,
  actor,
  flags = {}
} = {}) {
  return {
    id,
    x,
    y,
    width,
    height,
    ...(depth === undefined ? {} : { depth }),
    ...(actor === undefined ? {} : { actor }),
    elevation,
    rotation,
    flags,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
}

function makeStateFixture(options = {}) {
  const grid = createFakeSquareGrid({ originX: 25, originY: 50, distance: 5 });
  const scene = makeSquareScene(grid);
  scene.id = "scene-1";
  const token = makeDocument({
    x: grid.getTopLeftPoint({ i: 2, j: 3 }).x,
    y: grid.getTopLeftPoint({ i: 2, j: 3 }).y,
    ...options
  });
  return { grid, scene, token };
}

describe("TacticalTokenState", () => {
  it.each([
    [true, true],
    [false, false]
  ])("preserves enabled participation=%s as state participation=%s", (enabled, participating) => {
    const { scene, token } = makeStateFixture({
      flags: { [MODULE_ID]: { enabled } }
    });

    expect(buildTacticalTokenState(token, scene, {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    })).toMatchObject({ enabled, participating });
  });

  it("defaults missing pitch to zero and normalizes invalid pitch for display", () => {
    const { scene, token } = makeStateFixture({
      flags: { [MODULE_ID]: { pitch: 22 } }
    });
    const originalFlags = structuredClone(token.flags);

    const state = buildTacticalTokenState(token, scene, {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    });

    expect(state.pitch).toBe(0);
    expect(token.flags).toEqual(originalFlags);
    const missingPitch = makeStateFixture().token;
    const missingPitchState = buildTacticalTokenState(missingPitch, scene, {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    });
    expect(missingPitchState.pitch).toBe(0);
  });

  it("keeps arbitrary native rotation readable for the editor", () => {
    const { scene, token } = makeStateFixture({ rotation: 183 });
    expect(buildTacticalTokenState(token, scene, {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    }).heading).toBe(3);
  });

  it("builds the complete placed-token state, including anchor, off-grid, orientation, and dimensions", () => {
    const { scene, token } = makeStateFixture({
      actor: { name: "The Spelljammer", img: "worlds/demo/ships/actor.webp" },
      width: 3,
      height: 2,
      depth: 4,
      elevation: 7.5,
      rotation: 270,
      flags: {
        [MODULE_ID]: {
          enabled: true,
          pitch: 45,
          art: { preset: "custom", icon: "ship.webp" }
        }
      }
    });

    const state = buildTacticalTokenState(token, scene, {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    });

    expect(state).toMatchObject({
      tokenId: "placed",
      sceneId: "scene-1",
      actorName: "The Spelljammer",
      actorTextureSource: "worlds/demo/ships/actor.webp",
      centerX: token.x + 150,
      centerY: token.y + 100,
      tacticalX: 4.5,
      tacticalY: 3,
      tacticalZ: 1.5,
      elevation: 7.5,
      heading: 90,
      pitch: 45,
      width: 3,
      height: 2,
      depth: 4,
      offGrid: true,
      elevationOffGrid: true,
      art: { preset: "custom", icon: "ship.webp" }
    });
    expect(state.token).toBeUndefined();
    expect(state.document).toBeUndefined();
  });

  it("uses copied prototype flags but does not read prototype data for placed runtime state", () => {
    const prototype = makeDocument({
      id: "prototype",
      elevation: 999,
      flags: {
        [MODULE_ID]: { enabled: true, pitch: 45, art: { preset: "generic-ship" } }
      }
    });
    const placed = makeDocument({
      flags: structuredClone(prototype.flags),
      elevation: 10
    });
    const { scene } = makeStateFixture();
    const adapterOptions = {
      coordinateAdapter: new CoordinateAdapter(),
      orientationAdapter: new OrientationAdapter()
    };

    expect(buildTacticalTokenState(placed, scene, adapterOptions)).toMatchObject({
      enabled: true,
      pitch: 45,
      elevation: 10,
      tacticalZ: 2
    });

    prototype.flags[MODULE_ID].enabled = false;
    prototype.flags[MODULE_ID].pitch = -90;
    prototype.elevation = -100;

    expect(buildTacticalTokenState(placed, scene, adapterOptions)).toMatchObject({
      enabled: true,
      pitch: 45,
      elevation: 10,
      tacticalZ: 2
    });
  });

  it("routes runtime diagnostics through the TacticalTokenState service", () => {
    const { scene, token } = makeStateFixture();
    const coordinateAdapter = new CoordinateAdapter();
    const orientationAdapter = new OrientationAdapter();
    const coordinateSpy = vi.spyOn(coordinateAdapter, "toTactical");
    const runtime = createRuntime({ coordinateAdapter, orientationAdapter });
    const api = createModuleApi(runtime);
    const state = api.getTacticalState(token, scene);

    expect(state.tokenId).toBe("placed");
    expect(coordinateSpy).toHaveBeenCalledWith(token, scene, undefined);
    expect(api.getTacticalTokenState()).toBe(runtime.getService("tacticalTokenState"));
  });
});
