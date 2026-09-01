import { describe, expect, it, vi } from "vitest";

import { MODULE_ID } from "../../scripts/constants.js";
import { SynchronizationCoordinator } from "../../scripts/synchronization-coordinator.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";

function createFrameScheduler() {
  const callbacks = [];
  const scheduler = vi.fn((callback) => {
    callbacks.push(callback);
    return callback;
  });
  scheduler.cancel = vi.fn((callback) => {
    const index = callbacks.indexOf(callback);
    if (index >= 0) callbacks.splice(index, 1);
  });
  scheduler.flush = () => {
    const pending = callbacks.splice(0);
    pending.forEach((callback) => callback(123));
  };
  scheduler.pendingCount = () => callbacks.length;
  return scheduler;
}

function createToken(id = "token-1") {
  return {
    id,
    update: vi.fn(),
    flags: {
      [MODULE_ID]: {
        enabled: true,
        pitch: 0
      }
    }
  };
}

describe("SynchronizationCoordinator", () => {
  it("publishes an invalidation for finalized external movement", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    const token = createToken();

    hooks.fire("moveToken", token, { dx: 1 }, { changed: { x: 100 } }, "user-1");
    expect(listener).not.toHaveBeenCalled();
    scheduler.flush();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: "token-invalidation",
      tokenIds: ["token-1"],
      reasons: ["movement"]
    });
  });

  it("invalidates external rotation and module pitch changes", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    const token = createToken();

    hooks.fire("updateToken", token, { rotation: 90 }, {}, "user-1");
    hooks.fire(
      "updateToken",
      token,
      { [`flags.${MODULE_ID}.pitch`]: 45 },
      {},
      "user-1"
    );
    scheduler.flush();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      tokenIds: ["token-1"],
      reasons: ["rotation", "module-flags"]
    });
  });

  it("ignores unrelated token updates", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire("updateToken", createToken(), { actorId: "actor-2" }, {}, "user-1");
    hooks.fire(
      "updateToken",
      createToken("token-2"),
      { flags: { "other-module": { value: true } } },
      {},
      "user-1"
    );

    expect(scheduler).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("invalidates art, size, and visibility-related token changes", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire(
      "updateToken",
      createToken(),
      { texture: { src: "icons/new.webp" }, width: 2, hidden: true },
      {},
      "user-1"
    );
    scheduler.flush();

    expect(listener.mock.calls[0][0].reasons).toEqual(["visibility-or-appearance"]);
  });

  it("invalidates depth/dimension changes and preserves arbitrary external rotation/elevation for readers", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire(
      "updateToken",
      createToken(),
      { depth: 3, rotation: 17, elevation: 7.5 },
      {},
      "user-1"
    );
    scheduler.flush();

    expect(listener.mock.calls[0][0]).toMatchObject({
      reasons: ["movement", "rotation", "visibility-or-appearance"],
      changedFields: expect.arrayContaining(["elevation", "rotation", "depth"])
    });
  });

  it("publishes Scene lifecycle events to one subscriber boundary", () => {
    const hooks = createFakeFoundryHooks();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler: createFrameScheduler() });
    const lifecycle = vi.fn();

    coordinator.subscribeLifecycle(lifecycle);
    coordinator.start();
    const canvas = { scene: { id: "scene-a" } };
    hooks.fire("canvasReady", canvas);
    hooks.fire("updateScene", canvas.scene, { flags: {} });
    hooks.fire("canvasTearDown", canvas);

    expect(lifecycle.mock.calls.map(([event]) => event.type)).toEqual([
      "canvas-ready", "scene-update", "canvas-teardown"
    ]);
    expect(hooks.listenerCount("canvasReady")).toBe(1);
    expect(hooks.listenerCount("updateScene")).toBe(1);
  });

  it("coalesces movement/update bursts into one scheduled invalidation", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();
    const token = createToken();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire("updateToken", token, { x: 100, y: 200 }, {}, "user-1");
    hooks.fire("moveToken", token, {}, {}, "user-1");

    expect(scheduler).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.flush();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].reasons).toEqual(["movement"]);
  });

  it("never writes a document while handling hooks", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const token = createToken();

    coordinator.subscribe(() => {});
    coordinator.start();
    hooks.fire("updateToken", token, { rotation: 45 }, {}, "user-1");
    scheduler.flush();

    expect(token.update).not.toHaveBeenCalled();
  });

  it("publishes deleted token ids so subscribers can clear local state", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire("deleteToken", createToken("deleted-token"), {}, "user-1");
    scheduler.flush();

    expect(listener.mock.calls[0][0]).toMatchObject({
      type: "token-invalidation",
      tokenIds: ["deleted-token"],
      deletedTokenIds: ["deleted-token"],
      reasons: ["deletion"]
    });
  });

  it("publishes created token ids so visible-state consumers refresh", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire("createToken", createToken("created-token"), {}, "user-1");
    scheduler.flush();

    expect(listener.mock.calls[0][0]).toMatchObject({
      tokenIds: ["created-token"],
      createdTokenIds: ["created-token"],
      reasons: ["creation"]
    });
  });

  it("stops delivering events after teardown and unregisters hooks", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    coordinator.teardown();

    expect(hooks.listenerCount("moveToken")).toBe(0);
    hooks.fire("moveToken", createToken(), {}, {}, "user-1");
    scheduler.flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("deactivates on canvas teardown and resumes after canvas is ready", () => {
    const hooks = createFakeFoundryHooks();
    const scheduler = createFrameScheduler();
    const coordinator = new SynchronizationCoordinator({ hooks, scheduler });
    const listener = vi.fn();

    coordinator.subscribe(listener);
    coordinator.start();
    hooks.fire("canvasTearDown", {});
    hooks.fire("moveToken", createToken(), {}, {}, "user-1");
    scheduler.flush();
    expect(listener).not.toHaveBeenCalled();

    hooks.fire("canvasReady", {});
    hooks.fire("moveToken", createToken(), {}, {}, "user-1");
    scheduler.flush();
    expect(listener).toHaveBeenCalledOnce();
  });
});
