const GRIDLESS_TYPE = 0;
const SQUARE_TYPE = 1;

export const SCENE_ELIGIBILITY_REASON_CODES = Object.freeze({
  INVALID_SCENE: "INVALID_SCENE",
  GRIDLESS: "GRIDLESS",
  HEX_GRID: "HEX_GRID",
  UNSUPPORTED_GRID: "UNSUPPORTED_GRID",
  GRID_SIZE: "GRID_SIZE",
  GRID_DISTANCE: "GRID_DISTANCE",
  DIMENSIONS: "DIMENSIONS"
});

const REASONS = Object.freeze({
  [SCENE_ELIGIBILITY_REASON_CODES.INVALID_SCENE]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.INVALID_SCENE,
    message: "Tactical Viewer requires a valid Scene with grid data."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.GRIDLESS]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.GRIDLESS,
    message: "Tactical Viewer does not support gridless Scenes."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.HEX_GRID]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.HEX_GRID,
    message: "Tactical Viewer v1 requires a square grid; hexagonal Scenes are unsupported."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.UNSUPPORTED_GRID]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.UNSUPPORTED_GRID,
    message: "Tactical Viewer v1 requires a square grid."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.GRID_SIZE]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.GRID_SIZE,
    message: "Tactical Viewer requires a positive grid pixel size."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.GRID_DISTANCE]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.GRID_DISTANCE,
    message: "Tactical Viewer requires a positive grid distance."
  }),
  [SCENE_ELIGIBILITY_REASON_CODES.DIMENSIONS]: Object.freeze({
    code: SCENE_ELIGIBILITY_REASON_CODES.DIMENSIONS,
    message: "Tactical Viewer requires positive Scene width and height."
  })
});

function reason(code) {
  return REASONS[code];
}

function result(eligible, failureCode = undefined) {
  return Object.freeze({
    eligible,
    reason: failureCode ? reason(failureCode) : null
  });
}

function normalizedGridType(grid) {
  if (!grid || typeof grid !== "object") return "invalid";
  if (grid.gridless === true || grid.type === GRIDLESS_TYPE) return "gridless";

  if (typeof grid.type === "string") {
    const type = grid.type.toLowerCase().replaceAll("_", "-");
    if (type === "gridless" || type === "none") return "gridless";
    if (type === "square" || type === "square-grid") return "square";
    if (type === "hex" || type === "hex-grid" || type === "hexagonal" || type.startsWith("hex-")) {
      return "hex";
    }
  }

  if (grid.type === SQUARE_TYPE) return "square";
  if (Number.isInteger(grid.type) && grid.type >= 2 && grid.type <= 5) return "hex";
  return "invalid";
}

function finitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function validDimensions(scene) {
  const dimensions = scene.dimensions && typeof scene.dimensions === "object"
    ? scene.dimensions
    : scene;
  const width = firstDefined(dimensions.width, scene.width);
  const height = firstDefined(dimensions.height, scene.height);
  return finitePositive(width) && finitePositive(height);
}

/**
 * Validates the public Scene/grid values needed by interactive v1 behavior.
 * This service accepts a narrow Scene abstraction and has no Foundry globals.
 */
export class SceneEligibilityService {
  evaluate(scene) {
    if (!scene || typeof scene !== "object") {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.INVALID_SCENE);
    }

    const gridType = normalizedGridType(scene.grid);
    if (gridType === "gridless") {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.GRIDLESS);
    }
    if (gridType === "hex") {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.HEX_GRID);
    }
    if (gridType !== "square") {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.UNSUPPORTED_GRID);
    }

    const grid = scene.grid;
    const gridSize = firstDefined(grid.size, grid.sizeX);
    if (!finitePositive(gridSize) || (grid.sizeY !== undefined && !finitePositive(grid.sizeY))) {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.GRID_SIZE);
    }
    if (!finitePositive(grid.distance)) {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.GRID_DISTANCE);
    }
    if (!validDimensions(scene)) {
      return result(false, SCENE_ELIGIBILITY_REASON_CODES.DIMENSIONS);
    }

    return result(true);
  }

  isEligible(scene) {
    return this.evaluate(scene);
  }

  check(scene) {
    return this.evaluate(scene);
  }
}
