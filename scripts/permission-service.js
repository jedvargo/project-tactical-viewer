function documentOf(tokenOrPlaceable) {
  return tokenOrPlaceable?.document ?? tokenOrPlaceable;
}

function defaultUserProvider() {
  return globalThis.game?.user;
}

function updateFields(updateData) {
  return updateData && typeof updateData === "object" ? updateData : {};
}

function hasAnyField(updateData, fields) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(updateData, field));
}

function includesPitchUpdate(updateData) {
  if (Object.prototype.hasOwnProperty.call(updateData, "flags.tactical-3d-viewer.pitch")) {
    return true;
  }
  const moduleFlags = updateData.flags?.["tactical-3d-viewer"];
  return moduleFlags !== null
    && typeof moduleFlags === "object"
    && Object.prototype.hasOwnProperty.call(moduleFlags, "pitch");
}

/**
 * Foundry permission and token-lock boundary for tactical update actions.
 * Locking is kept separate from document permission so callers can explain
 * why an action is unavailable.
 */
export class PermissionService {
  constructor({ currentUser, userProvider = defaultUserProvider } = {}) {
    this.currentUser = currentUser;
    this.userProvider = userProvider;
  }

  getCurrentUser() {
    return this.currentUser ?? this.userProvider?.();
  }

  getLockState(tokenOrPlaceable) {
    const document = documentOf(tokenOrPlaceable);
    return Object.freeze({
      locked: document?.locked === true,
      lockRotation: document?.lockRotation === true
    });
  }

  canUserModify(tokenOrPlaceable, updateData = {}, action = "update") {
    const document = documentOf(tokenOrPlaceable);
    if (!document || typeof document !== "object") return false;

    const user = this.getCurrentUser();
    if (typeof document.canUserModify === "function") {
      return document.canUserModify(user, action, updateData) === true;
    }

    // This fallback only uses explicit, document-provided authority signals;
    // it never grants a non-GM permission from document existence alone.
    if (document.isOwner === true) return true;
    return user?.isGM === true;
  }

  canUpdate(tokenOrPlaceable, updateData = {}, { action } = {}) {
    const update = updateFields(updateData);
    if (!this.canUserModify(tokenOrPlaceable, update)) return false;

    const { locked, lockRotation } = this.getLockState(tokenOrPlaceable);
    const movementRequested = action === "move"
      || hasAnyField(update, ["x", "y", "elevation"]);
    const rotationRequested = action === "rotate"
      || hasAnyField(update, ["rotation"])
      || includesPitchUpdate(update);

    if (movementRequested && locked) return false;
    if (rotationRequested && lockRotation) return false;
    return true;
  }

  canMove(tokenOrPlaceable) {
    return this.canUpdate(tokenOrPlaceable, {}, { action: "move" });
  }

  canRotate(tokenOrPlaceable) {
    return this.canUpdate(tokenOrPlaceable, {}, { action: "rotate" });
  }

  canDelete(tokenOrPlaceable) {
    return this.canUserModify(tokenOrPlaceable, {}, "delete");
  }

  getCapabilities(tokenOrPlaceable) {
    const lockState = this.getLockState(tokenOrPlaceable);
    return Object.freeze({
      ...lockState,
      canUpdate: this.canUpdate(tokenOrPlaceable),
      canMove: this.canMove(tokenOrPlaceable),
      canRotate: this.canRotate(tokenOrPlaceable),
      canDelete: this.canDelete(tokenOrPlaceable)
    });
  }
}

export function canTokenBeUpdated(tokenOrPlaceable, updateData = {}, options = {}) {
  return new PermissionService().canUpdate(tokenOrPlaceable, updateData, options);
}
