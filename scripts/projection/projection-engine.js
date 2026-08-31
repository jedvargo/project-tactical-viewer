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

const ORTHOGRAPHIC_VIEW_IDS = Object.freeze(Object.keys(ORTHOGRAPHIC_VIEWS));

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

/**
 * Pure orthographic projection for the five interactive tactical views.
 *
 * A camera's focus is the world point placed at screenCenter (or the center
 * of viewport, or {0, 0} when neither is supplied). Scale is logical screen
 * units per tactical unit. Inverse projection uses the camera focus for the
 * hidden axis unless an interaction supplies an explicit preserved value.
 */
export class ProjectionEngine {
  describe(view) {
    const definition = ORTHOGRAPHIC_VIEWS[view];
    if (!definition) throw new RangeError(`Unknown orthographic view: ${view}`);
    return definition;
  }

  listViews() {
    return ORTHOGRAPHIC_VIEW_IDS;
  }

  projectPoint(point, camera) {
    const worldPoint = pointCoordinates(point);
    const { definition, focus, scale, screenCenter: center } = cameraContext(
      camera,
      ORTHOGRAPHIC_VIEWS
    );
    const horizontal = definition.horizontal;
    const vertical = definition.vertical;

    return freezeScreenPoint(
      center.x + horizontal.sign * (worldPoint[horizontal.axis] - focus[horizontal.axis]) * scale,
      center.y + vertical.sign * (worldPoint[vertical.axis] - focus[vertical.axis]) * scale
    );
  }

  projectVector(vector, camera) {
    const orientation = vectorCoordinates(vector);
    const { definition, scale } = cameraContext(camera, ORTHOGRAPHIC_VIEWS);
    const horizontal = definition.horizontal;
    const vertical = definition.vertical;
    const vectorByAxis = { x: orientation.dx, y: orientation.dy, z: orientation.dz };

    return freezeScreenPoint(
      horizontal.sign * vectorByAxis[horizontal.axis] * scale,
      vertical.sign * vectorByAxis[vertical.axis] * scale
    );
  }

  projectOrientationVector(vector, camera) {
    return this.projectVector(vector, camera);
  }

  inversePoint(screenPoint, camera, { preserve, hiddenCoordinate } = {}) {
    const screen = {
      x: coordinate(screenPoint, "x", "Screen point"),
      y: coordinate(screenPoint, "y", "Screen point")
    };
    const { definition, focus, scale, screenCenter: center } = cameraContext(
      camera,
      ORTHOGRAPHIC_VIEWS
    );
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

export function createProjectionEngine() {
  return new ProjectionEngine();
}
