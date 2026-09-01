import { describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../scripts/constants.js";
import { createModuleApi, createRuntime } from "../../scripts/runtime.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";

function makeToken({
  id,
  visible,
  enabled = true,
  canUserModify = vi.fn(() => true),
  locked = false,
  lockRotation = false
}) {
  const document = {
    id,
    x: 100,
    y: 100,
    width: 1,
    height: 1,
    elevation: 0,
    rotation: 180,
    locked,
    lockRotation,
    flags: { [MODULE_ID]: { enabled } },
    canUserModify,
    ...(visible === undefined ? {} : { object: { isVisible: visible } }),
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
  return document;
}

function makeRuntime(user) {
  return createRuntime({
    currentUser: user
  });
}

describe("runtime visibility security boundary", () => {
  it("enumerates only participating tokens visible to the current player", () => {
    const grid = createFakeSquareGrid();
    const scene = makeSquareScene(grid);
    scene.id = "scene";
    scene.tokens = [
      makeToken({ id: "visible", visible: true }),
      makeToken({ id: "hidden", visible: false }),
      makeToken({ id: "placeable-missing", visible: undefined, enabled: true }),
      makeToken({ id: "not-tactical", visible: true, enabled: false })
    ];
    const api = createModuleApi(makeRuntime({ id: "player", isGM: false }));

    expect(api.getVisibleTacticalStates(scene).map((state) => state.tokenId)).toEqual(["visible"]);
    expect(api.getTacticalState(scene.tokens[1], scene)).toBeNull();
    expect(api.getTacticalStates).toBeUndefined();
  });

  it("includes a visible token after its placed-document flag is updated, including legacy true", () => {
    const grid = createFakeSquareGrid();
    const scene = makeSquareScene(grid);
    scene.id = "scene";
    const token = makeToken({ id: "updated", visible: true, enabled: "true" });
    scene.tokens = [token];
    const api = createModuleApi(makeRuntime({ id: "player", isGM: false }));

    expect(api.getVisibleTacticalStates(scene).map((state) => state.tokenId)).toEqual(["updated"]);

    token.flags[MODULE_ID].enabled = false;
    expect(api.getVisibleTacticalStates(scene)).toEqual([]);
    token.flags[MODULE_ID].enabled = true;
    expect(api.getVisibleTacticalStates(scene).map((state) => state.tokenId)).toEqual(["updated"]);
  });

  it("does not expose hidden tokens to hit testing or overlap consumers", () => {
    const grid = createFakeSquareGrid();
    const scene = makeSquareScene(grid);
    scene.id = "scene";
    scene.tokens = [
      makeToken({ id: "visible", visible: true }),
      makeToken({ id: "hidden", visible: false })
    ];
    const api = createModuleApi(makeRuntime({ id: "player", isGM: false }));
    const visibleStates = api.getVisibleTacticalStates(scene);
    const suppliedOverlapModel = visibleStates.filter((state) => state.tacticalX === 1.5);

    expect(visibleStates.some((state) => state.tokenId === "hidden")).toBe(false);
    expect(suppliedOverlapModel.map((state) => state.tokenId)).toEqual(["visible"]);
  });

  it("includes the expected visible state for a GM while retaining distinct permissions", () => {
    const grid = createFakeSquareGrid();
    const scene = makeSquareScene(grid);
    scene.id = "scene";
    scene.tokens = [
      makeToken({ id: "hidden-from-player", visible: false, canUserModify: vi.fn(() => false) }),
      makeToken({ id: "locked", visible: true, locked: true, lockRotation: true })
    ];
    const api = createModuleApi(makeRuntime({ id: "gm", isGM: true }));
    const states = api.getVisibleTacticalStates(scene);

    expect(states.map((state) => state.tokenId)).toEqual(["locked"]);
    expect(states[0]).toMatchObject({
      locked: true,
      lockRotation: true,
      canCurrentUserUpdate: true,
      canCurrentUserMove: false,
      canCurrentUserRotate: false
    });
  });
});
