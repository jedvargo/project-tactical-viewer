const ORTHOGRAPHIC_VIEWS = Object.freeze({
  top: Object.freeze({
    id: "top",
    name: "Top",
    visibleAxes: Object.freeze(["x", "y"]),
    hiddenAxis: "z",
    horizontal: Object.freeze({ axis: "x", sign: 1 }),
    vertical: Object.freeze({ axis: "y", sign: -1 }),
    screenUp: Object.freeze({ axis: "y", sign: -1 }),
    mirroredAxis: null,
    labels: Object.freeze({
      horizontal: "+X East",
      vertical: "-Y North",
      hidden: "Z Up"
    })
  }),
  north: Object.freeze({
    id: "north",
    name: "North",
    visibleAxes: Object.freeze(["x", "z"]),
    hiddenAxis: "y",
    horizontal: Object.freeze({ axis: "x", sign: 1 }),
    vertical: Object.freeze({ axis: "z", sign: 1 }),
    screenUp: Object.freeze({ axis: "z", sign: 1 }),
    mirroredAxis: null,
    labels: Object.freeze({
      horizontal: "+X East",
      vertical: "+Z Up",
      hidden: "+Y South"
    })
  }),
  south: Object.freeze({
    id: "south",
    name: "South",
    visibleAxes: Object.freeze(["x", "z"]),
    hiddenAxis: "y",
    horizontal: Object.freeze({ axis: "x", sign: -1 }),
    vertical: Object.freeze({ axis: "z", sign: 1 }),
    screenUp: Object.freeze({ axis: "z", sign: 1 }),
    mirroredAxis: "horizontal",
    labels: Object.freeze({
      horizontal: "-X West",
      vertical: "+Z Up",
      hidden: "+Y South"
    })
  }),
  east: Object.freeze({
    id: "east",
    name: "East",
    visibleAxes: Object.freeze(["y", "z"]),
    hiddenAxis: "x",
    horizontal: Object.freeze({ axis: "y", sign: 1 }),
    vertical: Object.freeze({ axis: "z", sign: 1 }),
    screenUp: Object.freeze({ axis: "z", sign: 1 }),
    mirroredAxis: null,
    labels: Object.freeze({
      horizontal: "+Y South",
      vertical: "+Z Up",
      hidden: "+X East"
    })
  }),
  west: Object.freeze({
    id: "west",
    name: "West",
    visibleAxes: Object.freeze(["y", "z"]),
    hiddenAxis: "x",
    horizontal: Object.freeze({ axis: "y", sign: -1 }),
    vertical: Object.freeze({ axis: "z", sign: 1 }),
    screenUp: Object.freeze({ axis: "z", sign: 1 }),
    mirroredAxis: "horizontal",
    labels: Object.freeze({
      horizontal: "-Y North",
      vertical: "+Z Up",
      hidden: "+X East"
    })
  })
});

const ROOT_TWO = Math.sqrt(2);
const ROOT_SIX = Math.sqrt(6);
const ROOT_THREE = Math.sqrt(3);

function basisVector(x, y, z) {
  return Object.freeze({ x, y, z });
}

/*
 * Each isometric camera is a true equal-axis orthographic camera. `depth`
 * points from the tactical center toward the camera, so a larger depth key
 * is nearer. Keeping right/up/depth together prevents depth sorting from
 * drifting away from the screen projection.
 */
const ISOMETRIC_VIEWS = Object.freeze({
  "iso-ne": Object.freeze({
    id: "iso-ne",
    name: "Isometric NE",
    projection: "isometric",
    visibleAxes: Object.freeze(["x", "y", "z"]),
    hiddenAxis: null,
    basis: Object.freeze({
      right: basisVector(1 / ROOT_TWO, 1 / ROOT_TWO, 0),
      up: basisVector(-1 / ROOT_SIX, 1 / ROOT_SIX, 2 / ROOT_SIX),
      depth: basisVector(1 / ROOT_THREE, -1 / ROOT_THREE, 1 / ROOT_THREE)
    }),
    cameraPosition: basisVector(1, -1, 1),
    labels: Object.freeze({
      horizontal: "+X/+Y screen right",
      vertical: "+Z screen up",
      depth: "+X/-Y/+Z toward camera"
    })
  }),
  "iso-se": Object.freeze({
    id: "iso-se",
    name: "Isometric SE",
    projection: "isometric",
    visibleAxes: Object.freeze(["x", "y", "z"]),
    hiddenAxis: null,
    basis: Object.freeze({
      right: basisVector(-1 / ROOT_TWO, 1 / ROOT_TWO, 0),
      up: basisVector(-1 / ROOT_SIX, -1 / ROOT_SIX, 2 / ROOT_SIX),
      depth: basisVector(1 / ROOT_THREE, 1 / ROOT_THREE, 1 / ROOT_THREE)
    }),
    cameraPosition: basisVector(1, 1, 1),
    labels: Object.freeze({
      horizontal: "-X/+Y screen right",
      vertical: "+Z screen up",
      depth: "+X/+Y/+Z toward camera"
    })
  }),
  "iso-sw": Object.freeze({
    id: "iso-sw",
    name: "Isometric SW",
    projection: "isometric",
    visibleAxes: Object.freeze(["x", "y", "z"]),
    hiddenAxis: null,
    basis: Object.freeze({
      right: basisVector(-1 / ROOT_TWO, -1 / ROOT_TWO, 0),
      up: basisVector(1 / ROOT_SIX, -1 / ROOT_SIX, 2 / ROOT_SIX),
      depth: basisVector(-1 / ROOT_THREE, 1 / ROOT_THREE, 1 / ROOT_THREE)
    }),
    cameraPosition: basisVector(-1, 1, 1),
    labels: Object.freeze({
      horizontal: "-X/-Y screen right",
      vertical: "+Z screen up",
      depth: "-X/+Y/+Z toward camera"
    })
  }),
  "iso-nw": Object.freeze({
    id: "iso-nw",
    name: "Isometric NW",
    projection: "isometric",
    visibleAxes: Object.freeze(["x", "y", "z"]),
    hiddenAxis: null,
    basis: Object.freeze({
      right: basisVector(1 / ROOT_TWO, -1 / ROOT_TWO, 0),
      up: basisVector(1 / ROOT_SIX, 1 / ROOT_SIX, 2 / ROOT_SIX),
      depth: basisVector(-1 / ROOT_THREE, -1 / ROOT_THREE, 1 / ROOT_THREE)
    }),
    cameraPosition: basisVector(-1, -1, 1),
    labels: Object.freeze({
      horizontal: "+X/-Y screen right",
      vertical: "+Z screen up",
      depth: "-X/-Y/+Z toward camera"
    })
  })
});

const PROJECTION_VIEWS = Object.freeze({
  ...ORTHOGRAPHIC_VIEWS,
  ...ISOMETRIC_VIEWS
});
const PROJECTION_VIEW_IDS = Object.freeze(Object.keys(PROJECTION_VIEWS));

function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function positiveNumber(value, name) {
  finiteNumber(value, name);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function coordinate(point, axis, name) {
  return finiteNumber(point?.[axis], `${name}.${axis}`);
}

function pointCoordinates(point, name = "Point") {
  return {
    x: coordinate(point, "x", name),
    y: coordinate(point, "y", name),
    z: coordinate(point, "z", name)
  };
}

function vectorCoordinates(vector) {
  return {
    dx: coordinate(vector, "dx", "Orientation vector"),
    dy: coordinate(vector, "dy", "Orientation vector"),
    dz: coordinate(vector, "dz", "Orientation vector")
  };
}

function screenCenter(camera) {
  if (camera?.screenCenter !== undefined) {
    return {
      x: coordinate(camera.screenCenter, "x", "Camera screenCenter"),
      y: coordinate(camera.screenCenter, "y", "Camera screenCenter")
    };
  }

  if (camera?.viewport !== undefined) {
    return {
      x: finiteNumber(camera.viewport.width, "Camera viewport.width") / 2,
      y: finiteNumber(camera.viewport.height, "Camera viewport.height") / 2
    };
  }

  return { x: 0, y: 0 };
}

function cameraContext(camera, views) {
  const viewId = camera?.view;
  const definition = views[viewId];
  if (!definition) {
    throw new RangeError(
      `Projection view must be one of: ${Object.keys(views).join(", ")}`
    );
  }

  const focus = pointCoordinates(camera.focus, "Camera focus");
  const scale = positiveNumber(camera.scale, "Camera scale");
  return { definition, focus, scale, screenCenter: screenCenter(camera) };
}

function freezeScreenPoint(x, y) {
  return Object.freeze({ x, y });
}

function freezePoint({ x, y, z }) {
  return Object.freeze({ x, y, z });
}

function dotProduct(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function projectionDelta(point, focus) {
  return {
    x: point.x - focus.x,
    y: point.y - focus.y,
    z: point.z - focus.z
  };
}

function isometricProjection(definition, delta, scale, center) {
  return freezeScreenPoint(
    center.x + dotProduct(delta, definition.basis.right) * scale,
    center.y + dotProduct(delta, definition.basis.up) * scale
  );
}

function isometricVectorProjection(definition, vector, scale) {
  return freezeScreenPoint(
    dotProduct(vector, definition.basis.right) * scale,
    dotProduct(vector, definition.basis.up) * scale
  );
}

/**
 * Pure projection for the five orthographic and four fixed isometric tactical
 * views.
 *
 * A camera's focus is the world point placed at screenCenter (or the center
 * of viewport, or {0, 0} when neither is supplied). Scale is logical screen
 * units per tactical unit. Inverse projection uses the camera focus for the
 * hidden axis unless an interaction supplies an explicit preserved value.
 */
export class ProjectionEngine {
  describe(view) {
    const definition = PROJECTION_VIEWS[view];
    if (!definition) throw new RangeError(`Unknown projection view: ${view}`);
    return definition;
  }

  listViews() {
    return PROJECTION_VIEW_IDS;
  }

  projectPoint(point, camera) {
    const worldPoint = pointCoordinates(point);
    const { definition, focus, scale, screenCenter: center } = cameraContext(
      camera,
      PROJECTION_VIEWS
    );
    const delta = projectionDelta(worldPoint, focus);
    if (definition.basis) return isometricProjection(definition, delta, scale, center);

    const horizontal = definition.horizontal;
    const vertical = definition.vertical;

    return freezeScreenPoint(
      center.x + horizontal.sign * delta[horizontal.axis] * scale,
      center.y + vertical.sign * delta[vertical.axis] * scale
    );
  }

  projectVector(vector, camera) {
    const orientation = vectorCoordinates(vector);
    const { definition, scale } = cameraContext(camera, PROJECTION_VIEWS);
    const vectorByAxis = { x: orientation.dx, y: orientation.dy, z: orientation.dz };
    if (definition.basis) return isometricVectorProjection(definition, vectorByAxis, scale);

    const horizontal = definition.horizontal;
    const vertical = definition.vertical;

    return freezeScreenPoint(
      horizontal.sign * vectorByAxis[horizontal.axis] * scale,
      vertical.sign * vectorByAxis[vertical.axis] * scale
    );
  }

  projectOrientationVector(vector, camera) {
    return this.projectVector(vector, camera);
  }

  /**
   * Return signed distance along the camera's outward basis in tactical
   * units. Larger values are closer to the camera. This is intentionally not
   * scaled or translated by the panel: only relative ordering matters.
   */
  depthKey(point, camera) {
    const worldPoint = pointCoordinates(point);
    const { definition, focus } = cameraContext(camera, PROJECTION_VIEWS);
    if (!definition.basis) {
      throw new RangeError("Depth keys are only defined for isometric views");
    }
    return dotProduct(projectionDelta(worldPoint, focus), definition.basis.depth);
  }

  /**
   * Return a new far-to-near array. Equal-depth entries with IDs are ordered
   * lexicographically by String(id); entries without IDs retain their input
   * order. This makes normal TokenDocument IDs a deterministic tie-breaker
   * while preserving stable sorting for anonymous projection records.
   */
  sortByDepth(items, camera, { getPoint = (item) => item.point ?? item } = {}) {
    if (!Array.isArray(items)) throw new TypeError("Depth-sort items must be an array");

    return items
      .map((item, index) => ({
        item,
        index,
        depth: this.depthKey(getPoint(item), camera),
        id: item?.id === undefined || item?.id === null ? null : String(item.id)
      }))
      .sort((left, right) => {
        if (left.depth !== right.depth) return left.depth - right.depth;
        if (left.id !== null && right.id !== null && left.id !== right.id) {
          return left.id < right.id ? -1 : 1;
        }
        return left.index - right.index;
      })
      .map(({ item }) => item);
  }

  inversePoint(screenPoint, camera, { preserve, hiddenCoordinate } = {}) {
    const screen = {
      x: coordinate(screenPoint, "x", "Screen point"),
      y: coordinate(screenPoint, "y", "Screen point")
    };
    const { definition, focus, scale, screenCenter: center } = cameraContext(
      camera,
      PROJECTION_VIEWS
    );
    if (definition.basis) {
      throw new RangeError("Inverse projection is unavailable for isometric views");
    }

    const horizontal = definition.horizontal;
    const vertical = definition.vertical;
    const visible = {
      [horizontal.axis]: focus[horizontal.axis] +
        horizontal.sign * (screen.x - center.x) / scale,
      [vertical.axis]: focus[vertical.axis] +
        vertical.sign * (screen.y - center.y) / scale
    };
    const preserved = preserve?.[definition.hiddenAxis] ?? hiddenCoordinate ??
      focus[definition.hiddenAxis];
    finiteNumber(preserved, `Preserved ${definition.hiddenAxis} coordinate`);

    return freezePoint({
      x: visible.x ?? (definition.hiddenAxis === "x" ? preserved : undefined),
      y: visible.y ?? (definition.hiddenAxis === "y" ? preserved : undefined),
      z: visible.z ?? (definition.hiddenAxis === "z" ? preserved : undefined)
    });
  }
}

export const ORTHOGRAPHIC_VIEW_DEFINITIONS = ORTHOGRAPHIC_VIEWS;
export const ISOMETRIC_VIEW_DEFINITIONS = ISOMETRIC_VIEWS;
export const PROJECTION_VIEW_DEFINITIONS = PROJECTION_VIEWS;

export function createProjectionEngine() {
  return new ProjectionEngine();
}
