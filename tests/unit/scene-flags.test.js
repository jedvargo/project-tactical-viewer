import { describe, expect, it, vi } from "vitest";

import {
  getSceneEnabled,
  setSceneEnabled
} from "../../scripts/scene-flags.js";

function makeScene({ enabled = false, grid = { type: "square", size: 100, distance: 5 } } = {}) {
  let value = enabled;
  const flags = { other: { preserved: "yes" } };
  return {
    grid,
    dimensions: { width: 1000, height: 800 },
    flags,
    getFlag: vi.fn((_scope, key) => key === "enabled" ? value : 2),
    setFlag: vi.fn(async (_scope, key, nextValue) => {
      if (key === "enabled") {
        value = nextValue;
      }
      return nextValue;
    })
  };
}

describe("Scene tactical enable flag accessors", () => {
  it("reads and writes the namespaced Scene flag", async () => {
    const scene = makeScene();

    expect(getSceneEnabled(scene)).toBe(false);
    await setSceneEnabled(scene, true);

    expect(scene.setFlag).toHaveBeenCalledWith("tactical-3d-viewer", "enabled", true);
    expect(getSceneEnabled(scene)).toBe(true);
    expect(scene.getFlag("tactical-3d-viewer", "enabled")).toBe(true);
    expect(typeof scene.getFlag("tactical-3d-viewer", "enabled")).toBe("boolean");
    expect(scene.getFlag).toHaveBeenCalledWith("tactical-3d-viewer", "enabled");
  });

  it("does not enable an unsupported Scene", async () => {
    const scene = makeScene({ grid: { type: "hexagonal", size: 100, distance: 5 } });

    expect(await setSceneEnabled(scene, true)).toBe(false);
    expect(scene.setFlag).not.toHaveBeenCalled();
  });

  it("can disable an enabled Scene without touching unrelated flags", async () => {
    const scene = makeScene({ enabled: true });

    await setSceneEnabled(scene, false);

    expect(scene.setFlag).toHaveBeenCalledWith("tactical-3d-viewer", "enabled", false);
    expect(scene.getFlag("tactical-3d-viewer", "enabled")).toBe(false);
    expect(typeof scene.getFlag("tactical-3d-viewer", "enabled")).toBe("boolean");
  });

  it.each([
    [true, true],
    ["true", true],
    [false, false],
    ["false", false],
    [undefined, false]
  ])("normalizes legacy enabled value %j to %j without writing", (enabled, expected) => {
    const scene = {
      flags: { "tactical-3d-viewer": { enabled } },
      getFlag: vi.fn((_scope, key) => key === "enabled" ? enabled : 2),
      setFlag: vi.fn()
    };

    expect(getSceneEnabled(scene)).toBe(expected);
    expect(scene.setFlag).not.toHaveBeenCalled();
  });

  it("preserves unrelated Scene flags while saving a Boolean value", async () => {
    const values = { enabled: "true", other: { preserved: "yes" } };
    const scene = {
      grid: { type: "square", size: 100, distance: 5 },
      dimensions: { width: 1000, height: 800 },
      flags: { "tactical-3d-viewer": values, other: { preserved: "yes" } },
      getFlag: vi.fn((_scope, key) => values[key]),
      setFlag: vi.fn(async (_scope, key, value) => {
        values[key] = value;
        return value;
      })
    };

    await setSceneEnabled(scene, true);

    expect(values.enabled).toBe(true);
    expect(typeof values.enabled).toBe("boolean");
    expect(scene.getFlag("tactical-3d-viewer", "enabled")).toBe(true);
    expect(typeof scene.getFlag("tactical-3d-viewer", "enabled")).toBe("boolean");
    expect(scene.flags.other).toEqual({ preserved: "yes" });
  });
});
