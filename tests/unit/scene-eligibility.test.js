import { describe, expect, it } from "vitest";

import {
  SceneEligibilityService,
  SCENE_ELIGIBILITY_REASON_CODES
} from "../../scripts/scene-eligibility.js";

function makeScene(overrides = {}) {
  return {
    grid: {
      type: "square",
      size: 100,
      distance: 5
    },
    dimensions: {
      width: 1000,
      height: 800
    },
    ...overrides
  };
}

describe("SceneEligibilityService", () => {
  const service = new SceneEligibilityService();

  it("accepts a valid square-grid Scene", () => {
    expect(service.evaluate(makeScene())).toEqual({
      eligible: true,
      reason: null
    });
  });

  it.each([
    ["hexagonal", SCENE_ELIGIBILITY_REASON_CODES.HEX_GRID],
    ["gridless", SCENE_ELIGIBILITY_REASON_CODES.GRIDLESS]
  ])("rejects %s Scenes with a stable reason", (gridType, code) => {
    const first = service.evaluate(makeScene({ grid: { type: gridType } }));
    const second = service.evaluate(makeScene({ grid: { type: gridType } }));

    expect(first.eligible).toBe(false);
    expect(first.reason.code).toBe(code);
    expect(first.reason.message).toBeTruthy();
    expect(second).toEqual(first);
  });

  it.each([
    ["size", 0, SCENE_ELIGIBILITY_REASON_CODES.GRID_SIZE],
    ["size", -1, SCENE_ELIGIBILITY_REASON_CODES.GRID_SIZE],
    ["distance", 0, SCENE_ELIGIBILITY_REASON_CODES.GRID_DISTANCE],
    ["distance", -5, SCENE_ELIGIBILITY_REASON_CODES.GRID_DISTANCE]
  ])("rejects non-positive grid %s", (field, value, code) => {
    const grid = { type: "square", size: 100, distance: 5, [field]: value };

    expect(service.evaluate(makeScene({ grid }))).toMatchObject({
      eligible: false,
      reason: { code }
    });
  });

  it("rejects missing or invalid Scene dimensions", () => {
    expect(service.evaluate(makeScene({ dimensions: { width: 0, height: 800 } }))).toMatchObject({
      eligible: false,
      reason: { code: SCENE_ELIGIBILITY_REASON_CODES.DIMENSIONS }
    });
    expect(service.evaluate(makeScene({ dimensions: { width: 1000, height: -1 } }))).toMatchObject({
      eligible: false,
      reason: { code: SCENE_ELIGIBILITY_REASON_CODES.DIMENSIONS }
    });
  });
});
