import { describe, expect, it, vi } from "vitest";

import {
  getViewerDropData,
  panelIndexForDropTarget,
  resolveDroppedDocument,
  tokenDataForDrop
} from "../../scripts/viewer/drop-handler.js";

describe("tactical viewer drop handling", () => {
  it("reads Foundry JSON drag data and locates the target panel", () => {
    const panel = { dataset: { panelIndex: "2" }, parentElement: null };
    const canvas = { dataset: {}, parentElement: panel };
    const event = {
      target: canvas,
      dataTransfer: { getData: vi.fn(() => JSON.stringify({ type: "Actor", id: "actor-1" })) }
    };

    expect(getViewerDropData(event)).toEqual({ type: "Actor", id: "actor-1" });
    expect(panelIndexForDropTarget(canvas)).toBe(2);
  });

  it("uses the Foundry v14 namespaced TextEditor implementation", () => {
    const getDragEventData = vi.fn(() => ({
      type: "Actor",
      uuid: "Actor.actor-1"
    }));
    vi.stubGlobal("foundry", {
      applications: { ux: { TextEditor: { implementation: { getDragEventData } } } }
    });

    expect(getViewerDropData({ dataTransfer: { getData: vi.fn() } })).toEqual({
      type: "Actor",
      uuid: "Actor.actor-1"
    });
    expect(getDragEventData).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("builds token data from an Actor and accepts image payloads", async () => {
    const actor = {
      id: "actor-1",
      getTokenDocument: vi.fn(async () => ({
        toObject: () => ({ _id: "temporary", actorId: "actor-1", width: 2, height: 1 })
      }))
    };

    await expect(tokenDataForDrop(
      { type: "Actor", id: "actor-1" },
      { game: { actors: { get: () => actor } } }
    )).resolves.toMatchObject({ actorId: "actor-1", width: 2, height: 1 });

    await expect(tokenDataForDrop({
      type: "Image", src: "icons/ship.webp", width: 2, height: 1
    })).resolves.toMatchObject({
      texture: { src: "icons/ship.webp" }, width: 2, height: 1
    });
  });

  it("resolves an Actor from its real sidebar UUID payload", async () => {
    const actor = {
      id: "actor-1",
      getTokenDocument: vi.fn(async () => ({
        toObject: () => ({ _id: "temporary", actorId: "actor-1", width: 2, height: 1 })
      }))
    };
    const fromUuid = vi.fn(async (uuid) => uuid === "Actor.actor-1" ? actor : null);

    await expect(tokenDataForDrop(
      { type: "Actor", uuid: "Actor.actor-1" },
      { fromUuid, game: { actors: { get: vi.fn() } } }
    )).resolves.toMatchObject({ actorId: "actor-1", width: 2, height: 1 });
    expect(fromUuid).toHaveBeenCalledWith("Actor.actor-1");
    expect(actor.getTokenDocument).toHaveBeenCalledWith({ x: 0, y: 0, elevation: 0 });
  });

  it("finds an existing Token from a Token UUID when the direct resolver is unavailable", async () => {
    const token = { id: "token-1", toObject: () => ({ _id: "token-1", actorId: "actor-1" }) };
    const scene = {
      id: "scene-1",
      getEmbeddedDocument: vi.fn(() => token)
    };

    await expect(resolveDroppedDocument(
      { type: "Token", uuid: "Scene.scene-1.Token.token-1" },
      { fromUuid: vi.fn(async () => null), game: { scenes: { get: () => scene } } }
    )).resolves.toBe(token);
    expect(scene.getEmbeddedDocument).toHaveBeenCalledWith("Token", "token-1");
  });
});
