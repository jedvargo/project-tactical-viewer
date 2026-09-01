import { MODULE_ID } from "./constants.js";
import { CoordinateAdapter } from "./model/coordinate-adapter.js";
import { ElevationAdapter } from "./model/elevation-adapter.js";
import { OrientationAdapter } from "./model/orientation-adapter.js";
import { getTokenPitch } from "./model/token-flags.js";
import { buildTokenFlagUpdate } from "./model/token-flags.js";
import { PermissionService } from "./permission-service.js";

const UPDATE_ACTIONS = Object.freeze({
  MOVE: "move",
  ROTATE: "rotate",
  CONFIGURE: "configure"
});

function documentOf(tokenOrPlaceable) {
  return tokenOrPlaceable?.document ?? tokenOrPlaceable;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function result(status, properties = {}) {
  return Object.freeze({
    status,
    ok: status === "accepted",
    ...properties
  });
}

function rejected(reason, properties = {}) {
  return result("rejected", { reason, update: null, ...properties });
}

function conflict(fields) {
  return result("conflict", {
    reason: "conflict",
    conflictFields: Object.freeze([...fields]),
    update: null
  });
}

function readDelta(delta, axis) {
  if (!isRecord(delta)) return undefined;
  return delta[axis] ?? delta[`d${axis}`] ?? 0;
}

function deltaFor(delta, axes) {
  const normalized = {};
  for (const axis of axes) {
    const value = readDelta(delta, axis);
    if (!Number.isInteger(value)) {
      throw new TypeError(`Tactical ${axis.toUpperCase()} movement must be an integer grid step.`);
    }
    normalized[axis] = value;
  }
  if (Object.values(normalized).every((value) => value === 0)) {
    throw new TypeError("Tactical movement must change at least one axis.");
  }
  return normalized;
}

function currentField(tokenOrPlaceable, field) {
  const document = documentOf(tokenOrPlaceable);
  if (field === "pitch") return getTokenPitch(document);
  return document?.[field];
}

/**
 * The sole application service allowed to write tactical TokenDocument state.
 * All methods produce a partial update, validate the interaction snapshot,
 * and delegate the actual Document update to the shared commit boundary.
 */
export class TacticalUpdateService {
  constructor({
    coordinateAdapter,
    elevationAdapter,
    orientationAdapter = new OrientationAdapter(),
    permissionService = new PermissionService()
  } = {}) {
    const resolvedElevationAdapter = elevationAdapter
      ?? coordinateAdapter?.elevationAdapter
      ?? new ElevationAdapter();
    this.elevationAdapter = resolvedElevationAdapter;
    this.coordinateAdapter = coordinateAdapter ?? new CoordinateAdapter({
      elevationAdapter: resolvedElevationAdapter
    });
    this.orientationAdapter = orientationAdapter;
    this.permissionService = permissionService;
  }

  /** Capture canonical fields at interaction start; this never writes state. */
  captureSnapshot(tokenOrPlaceable) {
    return Object.freeze({
      x: currentField(tokenOrPlaceable, "x"),
      y: currentField(tokenOrPlaceable, "y"),
      elevation: currentField(tokenOrPlaceable, "elevation"),
      rotation: currentField(tokenOrPlaceable, "rotation"),
      pitch: currentField(tokenOrPlaceable, "pitch")
    });
  }

  captureInteractionSnapshot(tokenOrPlaceable) {
    return this.captureSnapshot(tokenOrPlaceable);
  }

  normalizeSnapshot(snapshot) {
    if (isRecord(snapshot?.snapshot)) return snapshot.snapshot;
    return snapshot;
  }

  validateSnapshot(tokenOrPlaceable, snapshot, fields) {
    const normalized = this.normalizeSnapshot(snapshot);
    if (!isRecord(normalized) || fields.some((field) => !hasOwn(normalized, field))) {
      return rejected("invalid-snapshot", { fields: Object.freeze([...fields]) });
    }

    const changed = fields.filter((field) => currentField(tokenOrPlaceable, field) !== normalized[field]);
    return changed.length > 0 ? conflict(changed) : null;
  }

  rejectionForUpdate(tokenOrPlaceable, update, action, movement, rotation) {
    if (this.permissionService.canUpdate(tokenOrPlaceable, update, { action })) return null;

    const { locked, lockRotation } = this.permissionService.getLockState(tokenOrPlaceable);
    if (movement && locked) return rejected("locked", { locked: true });
    if (rotation && lockRotation) return rejected("rotation-locked", { lockRotation: true });
    return rejected("permission");
  }

  async commit(tokenOrPlaceable, update, {
    snapshot,
    fields,
    action,
    movement = false,
    rotation = false
  }) {
    const permissionResult = this.rejectionForUpdate(
      tokenOrPlaceable,
      update,
      action,
      movement,
      rotation
    );
    if (permissionResult) return permissionResult;

    // Keep this comparison immediately adjacent to the only write. A remote
    // update to any field in this interaction cancels the stale commit.
    const snapshotResult = fields.length > 0
      ? this.validateSnapshot(tokenOrPlaceable, snapshot, fields)
      : null;
    if (snapshotResult) return snapshotResult;

    const document = documentOf(tokenOrPlaceable);
    if (typeof document?.update !== "function") {
      return rejected("document-update-unavailable");
    }

    try {
      const updatedDocument = await document.update(update);
      return result("accepted", {
        update: Object.freeze({ ...update }),
        document: updatedDocument
      });
    } catch (error) {
      return rejected("update-failed", { error });
    }
  }

  async moveXY(tokenOrPlaceable, scene, delta, snapshot) {
    try {
      const { x, y } = deltaFor(delta, ["x", "y"]);
      const current = this.coordinateAdapter.toTactical(tokenOrPlaceable, scene);
      const position = this.coordinateAdapter.toTokenPosition(
        tokenOrPlaceable,
        scene,
        { x: current.tacticalX + x, y: current.tacticalY + y }
      );
      const update = {};
      if (x !== 0) update.x = position.x;
      if (y !== 0) update.y = position.y;
      return await this.commit(tokenOrPlaceable, update, {
        snapshot,
        fields: [
          ...(x === 0 ? [] : ["x"]),
          ...(y === 0 ? [] : ["y"])
        ],
        action: UPDATE_ACTIONS.MOVE,
        movement: true
      });
    } catch (error) {
      return rejected("invalid", { error });
    }
  }

  async moveXZ(tokenOrPlaceable, scene, delta, snapshot) {
    return this.moveVerticalPlane(tokenOrPlaceable, scene, delta, snapshot, "x");
  }

  async moveYZ(tokenOrPlaceable, scene, delta, snapshot) {
    return this.moveVerticalPlane(tokenOrPlaceable, scene, delta, snapshot, "y");
  }

  /** Commit the one partial update selected by an orthographic projection. */
  async moveVisibleAxes(tokenOrPlaceable, scene, visibleAxes, delta, snapshot) {
    if (!Array.isArray(visibleAxes)) return rejected("invalid-projection");
    const method = {
      "x,y": "moveXY",
      "x,z": "moveXZ",
      "y,z": "moveYZ"
    }[visibleAxes.join(",")];
    if (!method) return rejected("invalid-projection");
    return this[method](tokenOrPlaceable, scene, delta, snapshot);
  }

  async moveVerticalPlane(tokenOrPlaceable, scene, delta, snapshot, horizontalAxis) {
    try {
      const horizontal = deltaFor(delta, [horizontalAxis, "z"]);
      const current = this.coordinateAdapter.toTactical(tokenOrPlaceable, scene);
      const update = {};
      const fields = [];

      if (horizontal[horizontalAxis] !== 0) {
        const target = {
          x: current.tacticalX,
          y: current.tacticalY
        };
        target[horizontalAxis] += horizontal[horizontalAxis];
        const position = this.coordinateAdapter.toTokenPosition(tokenOrPlaceable, scene, target);
        update[horizontalAxis] = position[horizontalAxis === "x" ? "x" : "y"];
        fields.push(horizontalAxis);
      }

      if (horizontal.z !== 0) {
        update.elevation = this.elevationAdapter.moveElevationByTacticalDelta(
          current.elevation,
          horizontal.z,
          scene
        );
        fields.push("elevation");
      }

      return await this.commit(tokenOrPlaceable, update, {
        snapshot,
        fields,
        action: UPDATE_ACTIONS.MOVE,
        movement: true
      });
    } catch (error) {
      return rejected("invalid", { error });
    }
  }

  async setHeading(tokenOrPlaceable, heading, snapshot) {
    try {
      const snappedHeading = this.orientationAdapter.snapHeading(heading);
      const rotation = this.orientationAdapter.headingToFoundryRotation(snappedHeading);
      return await this.commit(tokenOrPlaceable, { rotation }, {
        snapshot,
        fields: ["rotation"],
        action: UPDATE_ACTIONS.ROTATE,
        rotation: true
      });
    } catch (error) {
      return rejected("invalid", { error });
    }
  }

  async setPitch(tokenOrPlaceable, pitch, snapshot) {
    try {
      const update = {
        [`flags.${MODULE_ID}.pitch`]: this.orientationAdapter.snapPitch(pitch)
      };
      return await this.commit(tokenOrPlaceable, update, {
        snapshot,
        fields: ["pitch"],
        action: UPDATE_ACTIONS.ROTATE,
        rotation: true
      });
    } catch (error) {
      return rejected("invalid", { error });
    }
  }

  /** Persist placed-token or prototype-token tactical defaults as one partial update. */
  async setConfiguration(tokenOrPlaceable, configuration) {
    try {
      return await this.commit(tokenOrPlaceable, buildTokenFlagUpdate(configuration), {
        fields: [],
        action: UPDATE_ACTIONS.CONFIGURE
      });
    } catch (error) {
      return rejected("invalid", { error });
    }
  }
}
