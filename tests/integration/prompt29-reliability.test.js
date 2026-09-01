import { describe, expect, it, vi } from "vitest";

import { CURRENT_SCHEMA_VERSION, MODULE_ID } from "../../scripts/constants.js";
import {
  getSceneEnabled,
  getSceneFlags,
  migrateSceneFlags
} from "../../scripts/scene-flags.js";
import {
  buildTokenFlagUpdate,
  getTacticalTokenFlags,
  migrateTokenFlags
} from "../../scripts/model/token-flags.js";
import { AssetManager } from "../../scripts/rendering/asset-manager.js";
import { TacticalUpdateService } from "../../scripts/tactical-update-service.js";
import { SynchronizationCoordinator } from "../../scripts/synchronization-coordinator.js";
import { createRuntime } from "../../scripts/runtime.js";
import { createTacticalViewerApplicationClass } from "../../scripts/viewer/tactical-viewer-application.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";
import { SCENE_FLAG_FIXTURES } from "../fixtures/persistence/scene-flags.js";
import { TOKEN_FLAG_FIXTURES } from "../fixtures/persistence/token-flags.js";
import { USER_LAYOUT_FIXTURES } from "../fixtures/persistence/user-layouts.js";
import { migrateUserLayout } from "../../scripts/persistence/migrations.js";

function tokenWithFlags(flags) {
  return {
    id: "token-29",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    elevation: 0,
    rotation: 180,
    flags: { [MODULE_ID]: flags },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
}

function scheduler() {
  const callbacks = [];
  const schedule = (callback) => {
    callbacks.push(callback);
    return callback;
  };
  schedule.flush = () => callbacks.splice(0).forEach((callback) => callback());
  return schedule;
}

describe("Prompt 29 persistence recovery", () => {
  it.each(Object.entries(SCENE_FLAG_FIXTURES))("migrates Scene %s fixture to the current schema", (_version, fixture) => {
    const migrated = migrateSceneFlags(fixture);
    expect(migrated).toMatchObject({ schemaVersion: CURRENT_SCHEMA_VERSION, enabled: true });
    expect(migrateSceneFlags(migrated)).toEqual(migrated);
  });

  it("fails closed for malformed Scene flags without throwing", () => {
    const scene = {
      flags: { [MODULE_ID]: "corrupt" },
      getFlag: () => "corrupt"
    };
    expect(getSceneFlags(scene)).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false
    });
    expect(getSceneEnabled(scene)).toBe(false);
    expect(getSceneEnabled({ flags: { [MODULE_ID]: true } })).toBe(true);
  });

  it.each(Object.entries(TOKEN_FLAG_FIXTURES))("migrates Token %s fixture idempotently", (_version, fixture) => {
    const migrated = migrateTokenFlags(fixture);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrateTokenFlags(migrated)).toEqual(migrated);
  });

  it("uses safe defaults for malformed Token flags", () => {
    const token = tokenWithFlags({ enabled: "yes", pitch: 999, art: "broken" });
    expect(getTacticalTokenFlags(token)).toMatchObject({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      enabled: false,
      pitch: 0,
      art: { preset: "generic-ship", icon: "" }
    });
    expect(buildTokenFlagUpdate({ pitch: 999 })[`flags.${MODULE_ID}.pitch`]).toBe(0);
  });

  it("migrates each historical user layout while preserving valid Scene entries", () => {
    for (const fixture of Object.values(USER_LAYOUT_FIXTURES)) {
      const migrated = migrateUserLayout(fixture);
      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(Object.keys(migrated.scenes)).toHaveLength(1);
    }
    const recovered = migrateUserLayout({
      ...USER_LAYOUT_FIXTURES.v2,
      scenes: {
        healthy: USER_LAYOUT_FIXTURES.v2.scenes["scene-v2"],
        corrupt: { panels: "not-an-array" }
      }
    });
    expect(recovered.scenes.healthy).toBeDefined();
    expect(recovered.scenes.corrupt).toBeUndefined();
  });
});

describe("Prompt 29 update and asset recovery", () => {
  it("reports the accepted canonical document when Foundry clamps an update", async () => {
    const scene = makeSquareScene(createFakeSquareGrid({ distance: 5 }));
    const document = tokenWithFlags({ enabled: true, pitch: 0 });
    document.x = 100;
    document.update = vi.fn(async () => ({ ...document, x: 150 }));
    document.canUserModify = () => true;
    const service = new TacticalUpdateService();

    const result = await service.moveXY(document, scene, { x: 1, y: 0 }, service.captureSnapshot(document));

    expect(result).toMatchObject({
      status: "accepted",
      adjusted: true,
      adjustedFields: ["x"],
      canonical: { x: 150 }
    });
  });

  it("treats a null/false Foundry update result as a rejected update", async () => {
    const scene = makeSquareScene(createFakeSquareGrid({ distance: 5 }));
    const document = tokenWithFlags({ enabled: true, pitch: 0 });
    document.canUserModify = () => true;
    document.update = vi.fn(async () => null);
    const result = await new TacticalUpdateService().moveXY(
      document, scene, { x: 1, y: 0 }, { x: 0, y: 0, elevation: 0, rotation: 180, pitch: 0 }
    );
    expect(result).toMatchObject({ status: "rejected", reason: "update-rejected" });
  });

  it("refreshes the read-only viewer state after an accepted canonical adjustment", () => {
    const Application = createTacticalViewerApplicationClass({
      ApplicationV2: class {}
    });
    const application = Object.create(Application.prototype);
    application.viewerState = { movementPreview: { tokenId: "token-29" } };
    application.actionMessageElement = { textContent: "" };
    application.refreshFromDocuments = vi.fn();
    application.requestRender = vi.fn();

    application.handleActionResult({ status: "accepted", adjusted: true });

    expect(application.viewerState.movementPreview).toBeNull();
    expect(application.refreshFromDocuments).toHaveBeenCalledWith({ render: false });
    expect(application.actionMessageElement.textContent).toContain("adjusted");
    expect(application.requestRender).toHaveBeenCalledWith({
      type: "tactical-action-result",
      status: "accepted"
    });
  });

  it("reconnect refresh invalidates renderer caches before rebuilding state", () => {
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: class {} });
    const application = Object.create(Application.prototype);
    application.renderer = { invalidate: vi.fn() };
    application.refreshFromDocuments = vi.fn(() => ["rebuilt-state"]);
    application.requestRender = vi.fn();

    expect(application.reconnect()).toEqual(["rebuilt-state"]);
    expect(application.renderer.invalidate).toHaveBeenCalledWith({ type: "reconnect" });
    expect(application.refreshFromDocuments).toHaveBeenCalledWith({ render: false });
    expect(application.requestRender).toHaveBeenCalledWith({ type: "reconnect" });
  });

  it("memoizes path-resolution failures and still falls through to generic art", async () => {
    const resolvePath = vi.fn((source) => {
      if (source === "bad://path") throw new Error("bad path");
      return source;
    });
    const imageFactory = vi.fn(async (source) => ({ source, decode: async () => undefined }));
    const manager = new AssetManager({ resolvePath, imageFactory });
    const art = { views: { top: "bad://path" }, icon: "", preset: "generic-marker" };

    await expect(manager.loadArt(art, "top")).resolves.toMatchObject({ level: "preset" });
    await expect(manager.loadArt(art, "top")).resolves.toMatchObject({ level: "preset" });
    expect(resolvePath.mock.calls.filter(([source]) => source === "bad://path")).toHaveLength(1);
    expect(imageFactory.mock.calls.filter(([source]) => source === "bad://path")).toHaveLength(0);
  });
});

describe("Prompt 29 reconnect/coexistence", () => {
  it("refreshes an existing same-Scene viewer on ready and reconnect lifecycle events", async () => {
    const hooks = createFakeFoundryHooks();
    const viewer = { scene: null, render: vi.fn(), close: vi.fn(), reconnect: vi.fn() };
    class Viewer {
      constructor({ scene }) { this.scene = scene; viewer.scene = scene; }
      render() { return viewer.render(); }
      close(...args) { return viewer.close(...args); }
      reconnect(...args) { return viewer.reconnect(...args); }
    }
    const runtime = createRuntime({
      hooks,
      viewerApplicationClass: Viewer,
      settings: { register: vi.fn(), get: vi.fn(() => true) },
      synchronizationScheduler: scheduler()
    });
    runtime.initialize();
    const scene = {
      id: "scene-29",
      grid: { type: "square", size: 100, distance: 5 },
      dimensions: { width: 1000, height: 1000 },
      flags: { [MODULE_ID]: { enabled: true } },
      tokens: []
    };

    hooks.fire("canvasReady", { scene });
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.getViewerApplication()).not.toBeNull();
    hooks.fire("canvasReady", { scene });
    hooks.fire("ready");
    await Promise.resolve();
    await Promise.resolve();

    expect(viewer.reconnect).toHaveBeenCalledTimes(2);
  });

  it("coalesces native movement, rotation, and flag/config updates without document writes", () => {
    const hooks = createFakeFoundryHooks();
    const frame = scheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler: frame });
    const listener = vi.fn();
    const token = { id: "native-token", update: vi.fn() };
    coordinator.subscribe(listener);
    coordinator.start();

    hooks.fire("updateToken", token, { x: 200, rotation: 90 }, {}, "native");
    hooks.fire("moveToken", token, {}, {}, "native");
    hooks.fire("updateToken", token, {
      flags: { [MODULE_ID]: { pitch: 45, enabled: true } }
    }, {}, "native");
    frame.flush();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].reasons).toEqual([
      "movement", "rotation", "module-flags"
    ]);
    expect(token.update).not.toHaveBeenCalled();
  });

  it("does not deliver invalidations to an unsubscribed viewer", () => {
    const hooks = createFakeFoundryHooks();
    const frame = scheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler: frame });
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    coordinator.start();
    unsubscribe();

    hooks.fire("moveToken", { id: "closed-viewer-token" }, {}, {}, "native");
    frame.flush();

    expect(listener).not.toHaveBeenCalled();
  });
});
