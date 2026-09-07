import { MODULE_ID } from "./constants.js";
import { CoordinateAdapter } from "./model/coordinate-adapter.js";
import { ElevationAdapter } from "./model/elevation-adapter.js";
import { OrientationAdapter } from "./model/orientation-adapter.js";
import {
  buildTokenFlagUpdate,
  getTokenDepth,
  getTokenPitch,
  TOKEN_DEPTH_FLAG
} from "./model/token-flags.js";
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

function depthUpdateKey(tokenOrPlaceable) {
  // Keep tactical height in the module namespace. Foundry versions or game
  // systems may expose a native/default `depth` value that would otherwise
  // overwrite the user-selected tactical height during state refresh.
  void tokenOrPlaceable;
  return `flags.${MODULE_ID}.${TOKEN_DEPTH_FLAG}`;
}

function updateFieldName(key) {
  if (key === `flags.${MODULE_ID}.pitch`) return "pitch";
  if (key === `flags.${MODULE_ID}.${TOKEN_DEPTH_FLAG}`) return "depth";
  return key;
}

function updateKeyForField(tokenOrPlaceable, field) {
  return field === "depth" ? depthUpdateKey(tokenOrPlaceable) : field;
}

function canonicalValue(document, field) {
  const source = documentOf(document);
  if (field === "pitch") return getTokenPitch(source);
  if (field === "depth") return getTokenDepth(source);
  return source?.[field];
}

function canonicalFields(document, update) {
  const fields = {};
  for (const [key, value] of Object.entries(update)) {
    const field = updateFieldName(key);
    fields[field] = canonicalValue(document, field);
  }
  return fields;
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
  if (field === "depth") return getTokenDepth(document);
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

  captureSizeSnapshot(tokenOrPlaceable) {
    return Object.freeze({
      width: currentField(tokenOrPlaceable, "width"),
      height: currentField(tokenOrPlaceable, "height"),
      depth: currentField(tokenOrPlaceable, "depth")
    });
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
      if (!updatedDocument) return rejected("update-rejected");
      const canonical = canonicalFields(updatedDocument, update);
      const adjustedFields = Object.freeze(Object.entries(update)
        .map(([key]) => updateFieldName(key))
        .filter((field, index, fields) => fields.indexOf(field) === index)
        .filter((field) => canonical[field] !== update[updateKeyForField(updatedDocument, field)]));
      return result("accepted", {
        update: Object.freeze({ ...update }),
        document: updatedDocument,
        canonical: Object.freeze({ ...canonical }),
        adjusted: adjustedFields.length > 0,
        adjustedFields
      });
    } catch (error) {
      return rejected("update-failed", { error });
    }
  }

  async moveXY(tokenOrPlaceable, scene, delta, snapshot) {
    try {
      const { x, y } = deltaFor(delta, ["x", "y"]);
      const current = this.coordinateAdapter.toTactical(tokenOrPlaceable, scene);
      const position = typeof this.coordinateAdapter.moveByTacticalDelta === "function"
        ? this.coordinateAdapter.moveByTacticalDelta(
          tokenOrPlaceable,
          scene,
          { x, y }
        )
        : this.coordinateAdapter.toTokenPosition(
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

  /** Commit a snapped absolute XY position produced by the viewer drag preview. */
  async moveXYToPosition(tokenOrPlaceable, scene, position, snapshot) {
    try {
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
        return rejected("invalid-position");
      }
      const current = tokenOrPlaceable?.document ?? tokenOrPlaceable;
      const update = {};
      if (position.x !== current?.x) update.x = position.x;
      if (position.y !== current?.y) update.y = position.y;
      return await this.commit(tokenOrPlaceable, update, {
        snapshot,
        fields: [
          ...(update.x === undefined ? [] : ["x"]),
          ...(update.y === undefined ? [] : ["y"])
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

  async moveZ(tokenOrPlaceable, scene, delta, snapshot) {
    return this.moveVerticalPlane(tokenOrPlaceable, scene, delta, snapshot, "x");
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
        const position = typeof this.coordinateAdapter.moveByTacticalDelta === "function"
          ? this.coordinateAdapter.moveByTacticalDelta(
            tokenOrPlaceable,
            scene,
            { x: horizontalAxis === "x" ? horizontal[horizontalAxis] : 0,
              y: horizontalAxis === "y" ? horizontal[horizontalAxis] : 0 }
          )
          : this.coordinateAdapter.toTokenPosition(tokenOrPlaceable, scene, target);
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

  async setSize(tokenOrPlaceable, width, height, snapshot) {
    const nextWidth = Number(width);
    const nextHeight = Number(height);
    if (!Number.isInteger(nextWidth) || nextWidth < 1 || nextWidth > 20
      || !Number.isInteger(nextHeight) || nextHeight < 1 || nextHeight > 20) {
      return rejected("invalid-size");
    }
    return await this.commit(tokenOrPlaceable, {
      width: nextWidth,
      height: nextHeight
    }, {
      snapshot,
      fields: ["width", "height"],
      action: UPDATE_ACTIONS.CONFIGURE
    });
  }

  async setDimensions(tokenOrPlaceable, dimensions = {}, snapshot) {
    const update = {};
    const fields = [];
    for (const field of ["width", "height", "depth"]) {
      if (!hasOwn(dimensions, field)) continue;
      const value = Number(dimensions[field]);
      if (!Number.isInteger(value) || value < 1 || value > 20) {
        return rejected("invalid-size");
      }
      update[updateKeyForField(tokenOrPlaceable, field)] = value;
      fields.push(field);
    }
    if (fields.length === 0) return rejected("invalid-size");
    return await this.commit(tokenOrPlaceable, update, {
      snapshot,
      fields,
      action: UPDATE_ACTIONS.CONFIGURE
    });
  }

  async setDimension(tokenOrPlaceable, dimension, value, snapshot) {
    if (!["width", "height", "depth"].includes(dimension)) return rejected("invalid-size");
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next > 20) return rejected("invalid-size");
    return await this.commit(tokenOrPlaceable, { [updateKeyForField(tokenOrPlaceable, dimension)]: next }, {
      snapshot,
      fields: [dimension],
      action: UPDATE_ACTIONS.CONFIGURE
    });
  }

  /** Delete a placed TokenDocument through the same permission boundary as edits. */
  async deleteToken(tokenOrPlaceable) {
    const document = documentOf(tokenOrPlaceable);
    if (!this.permissionService.canDelete(tokenOrPlaceable)) {
      return rejected("permission");
    }
    if (typeof document?.delete !== "function") {
      return rejected("document-delete-unavailable");
    }

    try {
      const deletedDocument = await document.delete();
      return result("accepted", { document: deletedDocument ?? document });
    } catch (error) {
      return rejected("delete-failed", { error });
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
