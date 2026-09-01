import { describe, expect, it, vi } from "vitest";

import {
  AssetManager,
  GENERIC_ASSET_PATHS
} from "../../scripts/rendering/asset-manager.js";

function image(source) {
  return {
    source,
    decode: vi.fn(async () => undefined)
  };
}

describe("AssetManager", () => {
  it("loads and caches a decoded built-in preset", async () => {
    const decoded = image("ship");
    const imageFactory = vi.fn(async (source) => {
      decoded.source = source;
      return decoded;
    });
    const manager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });

    const loaded = await manager.loadPreset("ship");

    expect(loaded).toBe(decoded);
    expect(decoded.source).toBe(GENERIC_ASSET_PATHS.ship);
    expect(decoded.decode).toHaveBeenCalledOnce();
    expect(imageFactory).toHaveBeenCalledOnce();
  });

  it("provides module-owned ship, object, creature, and marker presets", () => {
    expect(Object.keys(GENERIC_ASSET_PATHS)).toEqual([
      "ship", "object", "creature", "marker"
    ]);
    expect(Object.values(GENERIC_ASSET_PATHS).every((path) =>
      path.startsWith("assets/generic/") && path.endsWith(".svg")
    )).toBe(true);
  });

  it("falls back from a failed preset to the generic marker", async () => {
    const marker = image("marker");
    const imageFactory = vi.fn(async (source) => {
      if (source === GENERIC_ASSET_PATHS.ship) throw new Error("missing ship");
      return marker;
    });
    const manager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });

    await expect(manager.loadPreset("ship")).resolves.toBe(marker);
    expect(imageFactory).toHaveBeenCalledTimes(2);
    expect(imageFactory).toHaveBeenLastCalledWith(GENERIC_ASSET_PATHS.marker);
  });

  it("memoizes a broken source and does not request it again", async () => {
    const imageFactory = vi.fn(async () => {
      throw new Error("broken");
    });
    const manager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });

    await expect(manager.load("broken.webp")).resolves.toBeNull();
    await expect(manager.load("broken.webp")).resolves.toBeNull();

    expect(imageFactory).toHaveBeenCalledOnce();
    expect(manager.getStatus("broken.webp")).toBe("failed");
  });

  it("reuses the same in-flight request and decoded source", async () => {
    let resolveImage;
    const pending = new Promise((resolve) => { resolveImage = resolve; });
    const decoded = image("shared");
    const imageFactory = vi.fn(() => pending);
    const manager = new AssetManager({
      imageFactory,
      resolvePath: (source) => source
    });

    const first = manager.load("shared.webp");
    const second = manager.load("shared.webp");
    resolveImage(decoded);

    await expect(first).resolves.toBe(decoded);
    await expect(second).resolves.toBe(decoded);
    expect(imageFactory).toHaveBeenCalledOnce();
    expect(manager.peek("shared.webp")).toBe(decoded);
  });

  it("bounds cache entries and supports explicit session cleanup", async () => {
    const imageFactory = vi.fn(async (source) => image(source));
    const manager = new AssetManager({
      maxEntries: 2,
      imageFactory,
      resolvePath: (source) => source
    });

    await manager.load("one.webp");
    await manager.load("two.webp");
    await manager.load("three.webp");

    expect(manager.cacheSize).toBeLessThanOrEqual(2);
    expect(manager.clear()).toBe(2);
    expect(manager.cacheSize).toBe(0);
  });
});
