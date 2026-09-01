import { describe, expect, it, vi } from "vitest";

import {
  AssetManager,
  GENERIC_ASSET_PATHS,
  getTacticalArtCandidates
} from "../../scripts/rendering/asset-manager.js";

function image(source) {
  return { source, decode: vi.fn(async () => undefined) };
}

function art(overrides = {}) {
  return {
    preset: "generic-object",
    icon: "icons/primary.webp",
    forwardOffset: 17,
    mirror: { northSouth: false, eastWest: false },
    views: {},
    ...overrides
  };
}

describe("tactical artwork resolution", () => {
  it("returns the strict exact, mirrored, primary, preset, marker fallback chain", () => {
    expect(getTacticalArtCandidates(art({
      views: { south: "icons/south.webp", north: "icons/north.webp" },
      mirror: { northSouth: true }
    }), "south")).toEqual([
      { source: "icons/south.webp", mirrored: false, level: "view" },
      { source: "icons/north.webp", mirrored: true, level: "mirrored-view" },
      { source: "icons/primary.webp", mirrored: false, level: "icon" },
      { source: GENERIC_ASSET_PATHS.object, mirrored: false, level: "preset" },
      { source: GENERIC_ASSET_PATHS.marker, mirrored: false, level: "marker" }
    ]);
  });

  it.each([
    ["exact custom view", "top", art({ views: { top: "top.webp" } }), "top.webp", false],
    ["opted-in mirrored view", "south", art({
      views: { north: "north.webp" },
      mirror: { northSouth: true }
    }), "north.webp", true],
    ["primary custom icon", "top", art({ icon: "primary.webp" }), "primary.webp", false],
    ["selected generic preset", "top", art({ icon: "", preset: "generic-creature" }),
      GENERIC_ASSET_PATHS.creature, false],
    ["generic marker", "top", art({ icon: "", preset: "generic-marker" }),
      GENERIC_ASSET_PATHS.marker, false]
  ])("resolves the %s level", async (_label, view, configuration, expectedSource, mirrored) => {
    const sources = [];
    const manager = new AssetManager({
      imageFactory: async (source) => {
        sources.push(source);
        return image(source);
      },
      resolvePath: (source) => source
    });

    const result = await manager.loadArt(configuration, view);

    expect(result).toMatchObject({
      image: expect.objectContaining({ source: expectedSource }),
      source: expectedSource,
      mirrored,
      forwardOffset: configuration.forwardOffset
    });
    expect(sources).toEqual([expectedSource]);
  });

  it("lets an exact view override beat the primary icon", async () => {
    const manager = new AssetManager({
      imageFactory: async (source) => image(source),
      resolvePath: (source) => source
    });

    const result = await manager.loadArt(art({ views: { top: "override.webp" } }), "top");

    expect(result.source).toBe("override.webp");
    expect(manager.getStatus("icons/primary.webp")).toBe("missing");
  });

  it("mirrors only an opted-in North/South or East/West opposite", () => {
    expect(getTacticalArtCandidates(art({
      views: { north: "north.webp" },
      mirror: { northSouth: false }
    }), "south")[0].source).toBe("icons/primary.webp");
    expect(getTacticalArtCandidates(art({
      views: { north: "north.webp" },
      mirror: { northSouth: true }
    }), "south")[0]).toMatchObject({ source: "north.webp", mirrored: true });
    expect(getTacticalArtCandidates(art({
      views: { west: "west.webp" },
      mirror: { eastWest: true }
    }), "east")[0]).toMatchObject({ source: "west.webp", mirrored: true });
    expect(getTacticalArtCandidates(art({
      views: { "iso-ne": "iso.webp" },
      mirror: { northSouth: true, eastWest: true }
    }), "iso-sw").some(({ mirrored }) => mirrored)).toBe(false);
  });

  it("falls through a broken custom override without retrying it", async () => {
    const broken = "broken-override.webp";
    const sources = [];
    const manager = new AssetManager({
      imageFactory: async (source) => {
        sources.push(source);
        if (source === broken) throw new Error("decode failed");
        return image(source);
      },
      resolvePath: (source) => source
    });
    const configuration = art({ views: { top: broken }, icon: "working-icon.webp" });

    const result = await manager.loadArt(configuration, "top");
    const repeated = await manager.loadArt(configuration, "top");

    expect(result.source).toBe("working-icon.webp");
    expect(repeated.source).toBe("working-icon.webp");
    expect(sources).toEqual([broken, "working-icon.webp"]);
    expect(manager.getStatus(broken)).toBe("failed");
  });
});
