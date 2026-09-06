import { describe, expect, it, vi } from "vitest";

import {
  getViewerDropData,
  panelIndexForDropTarget,
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
});
