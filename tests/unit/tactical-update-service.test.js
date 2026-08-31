import { describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../scripts/constants.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { ElevationAdapter } from "../../scripts/model/elevation-adapter.js";
import { OrientationAdapter } from "../../scripts/model/orientation-adapter.js";
import { PermissionService } from "../../scripts/permission-service.js";
import { TacticalUpdateService } from "../../scripts/tactical-update-service.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";

function makeToken({
  x = 100,
  y = 100,
  elevation = 0,
  rotation = 180,
  pitch = 0,
  locked = false,
  lockRotation = false,
  allowed = true
} = {}) {
  const document = {
    id: "token",
    x,
    y,
    width: 1,
    height: 1,
    elevation,
    rotation,
    locked,
    lockRotation,
    flags: { [MODULE_ID]: { pitch } },
    update: vi.fn(async (update) => {
      for (const [key, value] of Object.entries(update)) {
        if (key === `flags.${MODULE_ID}.pitch`) document.flags[MODULE_ID].pitch = value;
        else document[key] = value;
      }
      return document;
    }),
    canUserModify: vi.fn(() => allowed),
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
  return document;
}

function makeService() {
  const grid = createFakeSquareGrid({ distance: 5 });
  const scene = makeSquareScene(grid);
  const coordinateAdapter = new CoordinateAdapter();
  const orientationAdapter = new OrientationAdapter();
  const permissionService = new PermissionService({
    currentUser: { id: "owner", isGM: false }
  });
  return {
    scene,
    service: new TacticalUpdateService({
      coordinateAdapter,
      elevationAdapter: new ElevationAdapter(),
      orientationAdapter,
      permissionService
    })
  };
}

describe("TacticalUpdateService", () => {
  it("builds exact partial payloads for XY, XZ, YZ, heading, and pitch actions", async () => {
    const { scene, service } = makeService();
    const xy = makeToken();
    const xz = makeToken({ elevation: 7.5 });
    const yz = makeToken();
    const heading = makeToken();
    const pitch = makeToken();

    expect(await service.moveXY(xy, scene, { x: 1, y: -1 }, service.captureSnapshot(xy)))
      .toMatchObject({ status: "accepted", update: { x: 200, y: 0 } });
    expect(await service.moveXZ(xz, scene, { x: 1, z: 1 }, service.captureSnapshot(xz)))
      .toMatchObject({ status: "accepted", update: { x: 200, elevation: 15 } });
    expect(await service.moveYZ(yz, scene, { y: -1, z: -1 }, service.captureSnapshot(yz)))
      .toMatchObject({ status: "accepted", update: { y: 0, elevation: -5 } });
    expect(await service.setHeading(heading, 90, service.captureSnapshot(heading)))
      .toMatchObject({ status: "accepted", update: { rotation: 270 } });
    expect(await service.setPitch(pitch, 45, service.captureSnapshot(pitch)))
      .toMatchObject({
        status: "accepted",
        update: { [`flags.${MODULE_ID}.pitch`]: 45 }
      });

    expect(xy.update).toHaveBeenCalledWith({ x: 200, y: 0 });
    expect(xz.update).toHaveBeenCalledWith({ x: 200, elevation: 15 });
    expect(yz.update).toHaveBeenCalledWith({ y: 0, elevation: -5 });
    expect(heading.update).toHaveBeenCalledWith({ rotation: 270 });
    expect(pitch.update).toHaveBeenCalledWith({ [`flags.${MODULE_ID}.pitch`]: 45 });
  });

  it("calls TokenDocument.update exactly once for a successful action", async () => {
    const { scene, service } = makeService();
    const token = makeToken();

    const result = await service.moveXY(token, scene, { x: 1, y: 0 }, service.captureSnapshot(token));

    expect(result.status).toBe("accepted");
    expect(token.update).toHaveBeenCalledTimes(1);
  });

  it("does not update when permission is denied", async () => {
    const { scene, service } = makeService();
    const token = makeToken({ allowed: false });

    const result = await service.moveXY(token, scene, { x: 1, y: 0 }, service.captureSnapshot(token));

    expect(result).toMatchObject({ status: "rejected", reason: "permission" });
    expect(token.update).not.toHaveBeenCalled();
  });

  it("cancels a stale same-field XY edit without overwriting the remote move", async () => {
    const { scene, service } = makeService();
    const token = makeToken();
    const snapshot = service.captureSnapshot(token);
    token.x = 300;

    const result = await service.moveXY(token, scene, { x: 1, y: 0 }, snapshot);

    expect(result).toMatchObject({
      status: "conflict",
      reason: "conflict",
      conflictFields: ["x"]
    });
    expect(token.update).not.toHaveBeenCalled();
  });

  it("allows an unrelated concurrent XY change during a pitch edit", async () => {
    const { service } = makeService();
    const token = makeToken();
    const snapshot = service.captureSnapshot(token);
    token.x = 300;

    const result = await service.setPitch(token, 45, snapshot);

    expect(result.status).toBe("accepted");
    expect(token.update).toHaveBeenCalledWith({ [`flags.${MODULE_ID}.pitch`]: 45 });
    expect(token.x).toBe(300);
  });

  it("distinguishes locked movement from rotation-locked edits", async () => {
    const { scene, service } = makeService();
    const locked = makeToken({ locked: true });
    const rotationLocked = makeToken({ lockRotation: true });

    await expect(service.moveXY(locked, scene, { x: 1, y: 0 }, service.captureSnapshot(locked)))
      .resolves.toMatchObject({ status: "rejected", reason: "locked" });
    await expect(service.setHeading(rotationLocked, 90, service.captureSnapshot(rotationLocked)))
      .resolves.toMatchObject({ status: "rejected", reason: "rotation-locked" });
    expect(locked.update).not.toHaveBeenCalled();
    expect(rotationLocked.update).not.toHaveBeenCalled();
  });

  it("uses the elevation adapter snapping rule for an off-grid vertical action", async () => {
    const { scene, service } = makeService();
    const token = makeToken({ elevation: 7.5 });

    const result = await service.moveXZ(token, scene, { x: 0, z: 1 }, service.captureSnapshot(token));

    expect(result).toMatchObject({ status: "accepted", update: { elevation: 15 } });
  });

  it("captures only canonical document fields and has no renderer or hook dependency", () => {
    const { service } = makeService();
    const token = makeToken({ x: 12, y: 24, elevation: -5, rotation: 90, pitch: -45 });

    expect(service.captureSnapshot(token)).toEqual({
      x: 12,
      y: 24,
      elevation: -5,
      rotation: 90,
      pitch: -45
    });
  });
});
