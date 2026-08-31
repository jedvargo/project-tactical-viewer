import { describe, expect, it, vi } from "vitest";

import {
  getSceneEnabled,
  setSceneEnabled
} from "../../scripts/scene-flags.js";

function makeScene({ enabled = false, grid = { type: "square", size: 100, distance: 5 } } = {}) {
  let value = enabled;
  return {
    grid,
    dimensions: { width: 1000, height: 800 },
    getFlag: vi.fn(() => value),
    setFlag: vi.fn(async (_scope, _key, nextValue) => {
      value = nextValue;
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
  });
});
