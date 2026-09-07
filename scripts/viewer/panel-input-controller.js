import { ProjectionEngine } from "../projection/projection-engine.js";
import { CoordinateAdapter } from "../model/coordinate-adapter.js";

/** Logical zoom is deliberately independent of the canvas backing-store DPR. */
export const MIN_LOGICAL_ZOOM = 8;
export const MAX_LOGICAL_ZOOM = 512;
export const DEFAULT_LOGICAL_ZOOM = 64;
export const LOGICAL_ZOOM_STEP = 1.25;

function finiteOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function point(value, fallback = { x: 0, y: 0 }) {
  return {
    x: finiteOr(value?.x, fallback.x),
    y: finiteOr(value?.y, fallback.y)
  };
}

function samePointer(event, pointerId) {
  return pointerId === undefined || event?.pointerId === pointerId;
}

function orthographicDefinition(projectionEngine, view) {
  const definition = projectionEngine.describe(view);
  return definition.basis ? null : definition;
}

function isometricView(view) {
  return view === "isometric" || (typeof view === "string" && view.startsWith("iso-"));
}

function editableTarget(target) {
  const tagName = String(target?.tagName ?? "").toUpperCase();
  return tagName === "INPUT"
    || tagName === "TEXTAREA"
    || tagName === "SELECT"
    || target?.isContentEditable === true
    || target?.contentEditable === "true";
}

function tacticalPoint(state) {
  return {
    x: state.tacticalX,
    y: state.tacticalY,
    z: state.tacticalZ
  };
}

/** Clamp a logical pixels-per-cell value to the supported viewer range. */
export function clampLogicalZoom(value) {
  if (value === Infinity) return MAX_LOGICAL_ZOOM;
  if (value === -Infinity) return MIN_LOGICAL_ZOOM;
  const number = finiteOr(value, DEFAULT_LOGICAL_ZOOM);
  return Math.min(MAX_LOGICAL_ZOOM, Math.max(MIN_LOGICAL_ZOOM, number));
}

/**
 * Hit test a renderer-facing token model. The model is already culled by the
 * renderer, but the checks here intentionally fail closed if a caller passes
 * a broader collection. Hidden tokens therefore cannot become selectable by
 * accident through a second consumer.
 */
export function hitTestProjectedTokens(screenPoint, projectedTokens = []) {
  return getProjectedTokenCandidates(screenPoint, projectedTokens).at(0) ?? null;
}

/** Return all visible markers under a pointer, in deterministic chooser order. */
export function getProjectedTokenCandidates(screenPoint, projectedTokens = []) {
  const target = point(screenPoint);
  if (!Array.isArray(projectedTokens)) return [];

  return projectedTokens
    .filter((token) => token?.visibleToCurrentUser === true && token?.culled !== true)
    .map((token, index) => {
      const tokenPoint = point(token.point, { x: NaN, y: NaN });
      const radius = finiteOr(token.markerRadius, 0);
      const distance = Math.hypot(target.x - tokenPoint.x, target.y - tokenPoint.y);
      return { token, index, radius, distance };
    })
    .filter(({ token, radius, distance }) => token?.tokenId !== undefined
      && radius > 0 && Number.isFinite(distance) && distance <= radius)
    .sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      const leftId = String(left.token.tokenId);
      const rightId = String(right.token.tokenId);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    })
    .map(({ token }) => token);
}

/** Return visible token markers whose centers are inside a screen-space box. */
export function getProjectedTokensInSelectionBox(selectionBox, projectedTokens = []) {
  if (!selectionBox || !Array.isArray(projectedTokens)) return [];
  const left = Math.min(selectionBox.start?.x, selectionBox.end?.x);
  const right = Math.max(selectionBox.start?.x, selectionBox.end?.x);
  const top = Math.min(selectionBox.start?.y, selectionBox.end?.y);
  const bottom = Math.max(selectionBox.start?.y, selectionBox.end?.y);
  if (![left, right, top, bottom].every(Number.isFinite)) return [];
  return projectedTokens
    .filter((token) => token?.visibleToCurrentUser === true && token?.culled !== true)
    .filter((token) => Number.isFinite(token?.point?.x) && Number.isFinite(token?.point?.y))
    .filter((token) => token.point.x >= left && token.point.x <= right
      && token.point.y >= top && token.point.y <= bottom)
    .sort((leftToken, rightToken) => {
      const leftId = String(leftToken.tokenId);
      const rightId = String(rightToken.tokenId);
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
}

function localPoint(element, event) {
  const rect = element?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  return {
    x: finiteOr(event?.clientX, 0) - finiteOr(rect.left, 0),
    y: finiteOr(event?.clientY, 0) - finiteOr(rect.top, 0)
  };
}

/**
 * Pointer controller for one tactical panel. It owns only transient viewer
 * state (selection notification, focus, and logical zoom); it never receives
 * or writes a TokenDocument.
 */
export class PanelInputController {
  constructor({
    element,
    panel,
    scene,
    coordinateAdapter = new CoordinateAdapter(),
    tacticalUpdateService,
    getTokenById,
    getSelectedTokenState,
    getRenderModel,
    onSelectionChanged,
    onOverlapChooser,
    onSelectionBoxChanged,
    onViewChanged,
    onMovementPreview,
    onActionResult,
    onDeleteToken,
    onHeadingDelta,
    onPitchDelta,
    requestRender,
    keyboardTarget,
    projectionEngine = new ProjectionEngine(),
    zoomStep = LOGICAL_ZOOM_STEP,
    dragThreshold = 3
  } = {}) {
    if (!panel || typeof panel !== "object") {
      throw new TypeError("PanelInputController requires panel state");
    }
    this.element = element;
    this.panel = panel;
    this.scene = scene;
    this.coordinateAdapter = coordinateAdapter;
    this.tacticalUpdateService = tacticalUpdateService;
    this.getTokenById = typeof getTokenById === "function" ? getTokenById : () => null;
    this.getSelectedTokenState = typeof getSelectedTokenState === "function"
      ? getSelectedTokenState
      : () => null;
    this.getRenderModel = typeof getRenderModel === "function" ? getRenderModel : () => null;
    this.onSelectionChanged = onSelectionChanged;
    this.onOverlapChooser = onOverlapChooser;
    this.onSelectionBoxChanged = onSelectionBoxChanged;
    this.onViewChanged = onViewChanged;
    this.onMovementPreview = onMovementPreview;
    this.onActionResult = onActionResult;
    this.onDeleteToken = onDeleteToken;
    this.onHeadingDelta = onHeadingDelta;
    this.onPitchDelta = onPitchDelta;
    this.requestRender = requestRender;
    // Keyboard events from a focused canvas bubble through its panel surface.
    // Keeping this target separate also lets arrow keys work when focus is on
    // one of the panel's movement controls.
    this.keyboardTarget = keyboardTarget ?? element;
    this.projectionEngine = projectionEngine;
    this.zoomStep = zoomStep > 1 ? zoomStep : LOGICAL_ZOOM_STEP;
    this.dragThreshold = Math.max(0, dragThreshold);
    this.pointerId = undefined;
    this.pointerStart = undefined;
    this.pointerLast = undefined;
    this.pointerMoved = false;
    this.pointerButton = undefined;
    this.pointerToken = undefined;
    this.selectionBox = undefined;
    this.dragToken = undefined;
    this.dragDocument = undefined;
    this.dragSnapshot = undefined;
    this.dragStartTactical = undefined;
    this.dragGrabOffset = undefined;
    this.movementPreview = undefined;
    this.overlapCycleKey = undefined;
    this.overlapCycleIndex = 0;
    // Keyboard auto-repeat and rapid control clicks must be applied in order.
    // Otherwise every action can read the same pre-update TokenDocument.
    this.actionQueue = Promise.resolve();
    this.actionQueueBusy = false;
    this.attached = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.attach();
  }

  attach() {
    if (this.attached || !this.element?.addEventListener) return false;
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerCancel);
    this.element.addEventListener("contextmenu", this.handleContextMenu);
    this.element.addEventListener("wheel", this.handleWheel, { passive: false });
    this.keyboardTarget?.addEventListener?.("keydown", this.handleKeyDown);
    this.attached = true;
    return true;
  }

  detach() {
    if (!this.attached) return false;
    this.element?.removeEventListener?.("pointerdown", this.handlePointerDown);
    this.element?.removeEventListener?.("pointermove", this.handlePointerMove);
    this.element?.removeEventListener?.("pointerup", this.handlePointerUp);
    this.element?.removeEventListener?.("pointercancel", this.handlePointerCancel);
    this.element?.removeEventListener?.("contextmenu", this.handleContextMenu);
    this.element?.removeEventListener?.("wheel", this.handleWheel);
    this.keyboardTarget?.removeEventListener?.("keydown", this.handleKeyDown);
    this.attached = false;
    this.cancelPointer();
    this.clearDragState();
    this.setMovementPreview(null);
    this.setSelectionBox(null, null);
    return true;
  }

  currentModel() {
    return this.getRenderModel() ?? {};
  }

  enqueueAction(action) {
    if (!this.actionQueueBusy) {
      this.actionQueueBusy = true;
      let result;
      try {
        // Start the first action synchronously so a click/key press reaches
        // the update service before the browser returns to its event loop.
        result = action();
      } catch (error) {
        result = Promise.reject(error);
      }
      const current = Promise.resolve(result);
      this.actionQueue = current;
      current.then(
        () => { if (this.actionQueue === current) this.actionQueueBusy = false; },
        () => { if (this.actionQueue === current) this.actionQueueBusy = false; }
      );
      return current;
    }

    const queued = this.actionQueue.then(action, action);
    this.actionQueue = queued;
    queued.then(
      () => { if (this.actionQueue === queued) this.actionQueueBusy = false; },
      () => { if (this.actionQueue === queued) this.actionQueueBusy = false; }
    );
    return queued;
  }

  /** Keep viewer-originated movement inside the rendered cell volume. */
  clampMovementDelta(delta, token, current, model = this.currentModel()) {
    const grid = model?.grid ?? {};
    const columns = Number(grid.columns);
    const rows = Number(grid.rows);
    const depth = Number(grid.depth ?? grid.z);
    const width = Math.max(1, Number(token?.width ?? token?.document?.width ?? 1));
    const height = Math.max(1, Number(token?.height ?? token?.document?.height ?? 1));
    const tokenDepth = Math.max(1, Number(token?.depth ?? token?.document?.depth ?? 1));
    const bounds = {
      x: Number.isFinite(columns) ? [width / 2, columns - width / 2] : null,
      y: Number.isFinite(rows) ? [height / 2, rows - height / 2] : null,
      // tactical Z is the bottom of the token's vertical cell footprint.
      z: Number.isFinite(depth) ? [0, depth - tokenDepth] : null
    };
    const bounded = { ...(delta ?? {}) };
    for (const axis of ["x", "y", "z"]) {
      const range = bounds[axis];
      const step = Number(bounded[axis] ?? 0);
      const value = Number(current?.[`tactical${axis.toUpperCase()}`] ?? current?.[axis]);
      if (!range || !Number.isInteger(step) || !Number.isFinite(value)) continue;
      const minimum = Math.min(range[0], range[1]);
      const maximum = Math.max(range[0], range[1]);
      const target = value + step;
      if (target < minimum || target > maximum) {
        const clamped = Math.min(maximum, Math.max(minimum, target));
        bounded[axis] = Number.isInteger(value) && Number.isInteger(clamped)
          ? clamped - value
          : 0;
      }
    }
    return bounded;
  }

  currentCamera() {
    const model = this.currentModel();
    const source = model.camera ?? {};
    return {
      ...source,
      view: model.view ?? source.view ?? "top",
      focus: this.panel.focus ?? source.focus ?? { x: 0, y: 0, z: 0 },
      scale: clampLogicalZoom(this.panel.fitToPanel === true
        ? source.scale ?? DEFAULT_LOGICAL_ZOOM
        : this.panel.zoom ?? source.scale ?? DEFAULT_LOGICAL_ZOOM),
      screenCenter: source.screenCenter ?? {
        x: finiteOr(this.panel.dimensions?.width, 0) / 2,
        y: finiteOr(this.panel.dimensions?.height, 0) / 2
      }
    };
  }

  screenToTactical(screenPoint) {
    const camera = this.currentCamera();
    return this.projectionEngine.inversePoint(point(screenPoint), camera, {
      preserve: camera.focus
    });
  }

  projectedTokenAt(screenPoint) {
    return hitTestProjectedTokens(screenPoint, this.currentModel().tokens);
  }

  notifyViewChanged(change) {
    this.onViewChanged?.(change, this.panel);
    this.requestRender?.(change);
  }

  selectAt(screenPoint) {
    const candidates = getProjectedTokenCandidates(screenPoint, this.currentModel().tokens);
    let token = candidates[0];
    if (candidates.length > 1) {
      const key = candidates.map(({ tokenId }) => String(tokenId)).join("|");
      const chooserHandled = this.onOverlapChooser?.(candidates, screenPoint) === true;
      if (chooserHandled) {
        this.overlapCycleKey = undefined;
        this.overlapCycleIndex = 0;
      } else {
        this.overlapCycleIndex = this.overlapCycleKey === key
          ? (this.overlapCycleIndex + 1) % candidates.length
          : 0;
        this.overlapCycleKey = key;
      }
      token = candidates[this.overlapCycleIndex];
    } else {
      this.overlapCycleKey = undefined;
      this.overlapCycleIndex = 0;
    }
    this.onSelectionChanged?.(token?.tokenId ?? null, token ?? null);
    this.requestRender?.({ type: "selection", tokenId: token?.tokenId ?? null });
    return token;
  }

  startTokenDrag(local, token) {
    const view = this.currentCamera().view;
    if (isometricView(view) && token?.visibleToCurrentUser !== false) {
      if (token) {
        this.element.style.cursor = "not-allowed";
        this.onActionResult?.({
          status: "read-only",
          reason: "isometric-movement-disabled"
        }, token);
      }
      return false;
    }
    const definition = orthographicDefinition(this.projectionEngine, view);
    if (!definition
      || token?.visibleToCurrentUser === false
      || token?.canCurrentUserMove !== true) return false;
    const document = this.getTokenById(token.tokenId);
    if (!document || !this.scene
      || typeof this.tacticalUpdateService?.captureInteractionSnapshot !== "function") {
      return false;
    }

    const current = this.coordinateAdapter.toTactical(document, this.scene);
    const pointerTactical = this.projectionEngine.inversePoint(local, this.currentCamera(), {
      preserve: tacticalPoint(current)
    });
    this.dragToken = token;
    this.dragDocument = document;
    this.dragSnapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
    this.dragStartTactical = current;
    this.dragGrabOffset = Object.fromEntries(definition.visibleAxes.map((axis) => [
      axis,
      pointerTactical[axis] - tacticalPoint(current)[axis]
    ]));
    return true;
  }

  setMovementPreview(preview) {
    this.movementPreview = preview ?? undefined;
    this.onMovementPreview?.(preview ?? null);
    this.requestRender?.({ type: preview ? "movement-preview" : "movement-preview-cleared" });
  }

  setSelectionBox(start, end) {
    if (!start || !end) {
      this.selectionBox = undefined;
      this.onSelectionBoxChanged?.(null);
      this.requestRender?.({ type: "selection-box-cleared" });
      return null;
    }
    this.selectionBox = { start: point(start), end: point(end) };
    this.onSelectionBoxChanged?.(this.selectionBox);
    this.requestRender?.({ type: "selection-box", selectionBox: this.selectionBox });
    return this.selectionBox;
  }

  previewTokenAt(local) {
    if (!this.dragDocument || !this.dragStartTactical || !this.dragGrabOffset) return false;
    const pointerTactical = this.projectionEngine.inversePoint(local, this.currentCamera(), {
      preserve: tacticalPoint(this.dragStartTactical)
    });
    const definition = orthographicDefinition(
      this.projectionEngine,
      this.currentCamera().view
    );
    if (!definition) return false;
    let delta = Object.fromEntries(definition.visibleAxes.map((axis) => [
      axis,
      Math.round(pointerTactical[axis] - this.dragGrabOffset[axis]
        - tacticalPoint(this.dragStartTactical)[axis])
    ]));
    let previewPosition;
    if (definition.visibleAxes.includes("x") && definition.visibleAxes.includes("y")) {
      const snapped = this.coordinateAdapter.snapTacticalAnchor(
        this.dragDocument,
        this.scene,
        {
          x: pointerTactical.x - this.dragGrabOffset.x,
          y: pointerTactical.y - this.dragGrabOffset.y
        }
      );
      delta = {
        x: Math.round(snapped.tacticalX - this.dragStartTactical.tacticalX),
        y: Math.round(snapped.tacticalY - this.dragStartTactical.tacticalY)
      };
      previewPosition = snapped.position;
    }
    delta = this.clampMovementDelta(delta, this.dragToken, this.dragStartTactical);
    if (Object.values(delta).every((value) => value === 0)) {
      this.setMovementPreview(null);
      return true;
    }
    const start = tacticalPoint(this.dragStartTactical);
    const tacticalX = start.x + (delta.x ?? 0);
    const tacticalY = start.y + (delta.y ?? 0);
    let tacticalZ = start.z + (delta.z ?? 0);
    let elevation = this.dragStartTactical.elevation;
    let offGrid = this.dragStartTactical.offGrid;
    if (definition.visibleAxes.includes("z") && delta.z !== 0) {
      elevation = this.coordinateAdapter.moveElevationByTacticalDelta(
        this.dragStartTactical.elevation,
        delta.z,
        this.scene
      );
      tacticalZ = this.coordinateAdapter.toTacticalZ(elevation, this.scene);
      offGrid = false;
    }
    this.setMovementPreview({
      tokenId: this.dragToken.tokenId,
      tacticalX,
      tacticalY,
      tacticalZ,
      elevation,
      offGrid,
      delta,
      ...(previewPosition ? { position: previewPosition } : {}),
      preview: true
    });
    return true;
  }

  clearDragState() {
    this.dragToken = undefined;
    this.dragDocument = undefined;
    this.dragSnapshot = undefined;
    this.dragStartTactical = undefined;
    this.dragGrabOffset = undefined;
  }

  async commitTokenDrag() {
    const preview = this.movementPreview;
    const document = this.dragDocument;
    const snapshot = this.dragSnapshot;
    const token = this.dragToken;
    const position = preview?.position;
    this.clearDragState();
    const definition = orthographicDefinition(this.projectionEngine, this.currentCamera().view);
    const result = await this.commitMovementDelta(preview?.delta, {
      document,
      token,
      snapshot,
      definition,
      position
    });
    this.setMovementPreview(null);
    return result;
  }

  async commitMovementDelta(delta, { document, token, snapshot, definition, position } = {}) {
    const verticalOnly = delta
      && Number(delta.x ?? 0) === 0
      && Number(delta.y ?? 0) === 0
      && Number(delta.z ?? 0) !== 0;
    const axisKey = definition?.visibleAxes?.join(",");
    const moveMethod = { "x,y": "moveXY", "x,z": "moveXZ", "y,z": "moveYZ" }[axisKey];
    const absoluteXY = axisKey === "x,y"
      && position
      && typeof this.tacticalUpdateService?.moveXYToPosition === "function";
    const move = absoluteXY
      ? this.tacticalUpdateService.moveXYToPosition.bind(this.tacticalUpdateService)
      : verticalOnly && typeof this.tacticalUpdateService?.moveZ === "function"
      ? this.tacticalUpdateService.moveZ.bind(this.tacticalUpdateService)
      : typeof this.tacticalUpdateService?.moveVisibleAxes === "function"
      ? this.tacticalUpdateService.moveVisibleAxes.bind(this.tacticalUpdateService)
      : (typeof this.tacticalUpdateService?.[moveMethod] === "function"
        ? this.tacticalUpdateService[moveMethod].bind(this.tacticalUpdateService)
        : null);
    if (!delta || !document || !move) {
      return null;
    }

    const result = absoluteXY
      ? await move(document, this.scene, position, snapshot)
      : verticalOnly && typeof this.tacticalUpdateService?.moveZ === "function"
      ? await move(document, this.scene, delta, snapshot)
      : typeof this.tacticalUpdateService?.moveVisibleAxes === "function"
      ? await move(document, this.scene, definition.visibleAxes, delta, snapshot)
      : await move(document, this.scene, delta, snapshot);
    this.onActionResult?.(result, token);
    return result;
  }

  async moveByKeyboard(delta) {
    const definition = orthographicDefinition(this.projectionEngine, this.currentCamera().view);
    const selected = this.getSelectedTokenState();
    if (!definition || !selected || selected.visibleToCurrentUser !== true
      || selected.canCurrentUserMove !== true) return null;
    const document = this.getTokenById(selected.tokenId);
    if (!document || typeof this.tacticalUpdateService?.captureInteractionSnapshot !== "function") {
      return null;
    }
    const movementAxes = definition.visibleAxes.includes("z") || delta?.z === undefined
      ? definition.visibleAxes
      : [...definition.visibleAxes, "z"];
    const normalizedDelta = Object.fromEntries(movementAxes.map((axis) => [
      axis,
      Number.isInteger(delta?.[axis]) ? delta[axis] : 0
    ]));
    if (Object.values(normalizedDelta).every((value) => value === 0)) return null;
    const model = this.currentModel();
    let current = selected;
    if (model?.grid && typeof this.coordinateAdapter?.toTactical === "function") {
      try {
        current = this.coordinateAdapter.toTactical(document, this.scene);
      } catch {
        // Custom callers may provide a render grid without a Foundry grid.
        // In that case the update service remains the authority for movement.
      }
    }
    const snapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
    const boundedDelta = this.clampMovementDelta(
      normalizedDelta,
      selected,
      current,
      model
    );
    if (Object.values(boundedDelta).every((value) => value === 0)) return null;
    return this.commitMovementDelta(boundedDelta, {
      document,
      token: selected,
      snapshot,
      definition
    });
  }

  keyboardDelta(key) {
    const definition = orthographicDefinition(this.projectionEngine, this.currentCamera().view);
    if (!definition) return null;
    const axisDelta = (axis, value) => ({ [axis]: value });
    if (key === "ArrowLeft") {
      return axisDelta(definition.horizontal.axis, -definition.horizontal.sign);
    }
    if (key === "ArrowRight") {
      return axisDelta(definition.horizontal.axis, definition.horizontal.sign);
    }
    if (key === "ArrowUp") {
      return axisDelta(definition.vertical.axis, -definition.vertical.sign);
    }
    if (key === "ArrowDown") {
      return axisDelta(definition.vertical.axis, definition.vertical.sign);
    }
    if (key === "PageUp") return { z: 1 };
    if (key === "PageDown") return { z: -1 };
    return null;
  }

  async handleKeyDown(event) {
    if (editableTarget(event?.target)) return false;
    const key = event?.key;
    if (["Delete", "Backspace"].includes(key)) {
      if (typeof this.onDeleteToken !== "function") return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return this.enqueueAction(async () => {
        const result = await this.onDeleteToken();
        return result !== null;
      });
    }
    if (["[", "]"].includes(key)) {
      if (typeof this.onHeadingDelta !== "function") return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return this.enqueueAction(async () => {
        await this.onHeadingDelta(key === "[" ? -45 : 45);
        return true;
      });
    }
    if ([",", "."].includes(key)) {
      if (typeof this.onPitchDelta !== "function") return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      return this.enqueueAction(async () => {
        await this.onPitchDelta(key === "," ? -1 : 1);
        return true;
      });
    }
    const delta = this.keyboardDelta(key);
    if (!delta) return false;
    // Consume the browser/Foundry navigation event before awaiting the
    // authoritative update. Horizontal arrows otherwise get handled by a
    // parent application while the update promise is in flight.
    event.preventDefault?.();
    event.stopPropagation?.();
    return this.enqueueAction(async () => {
      const result = await this.moveByKeyboard(delta);
      return result !== null;
    });
  }

  handlePointerDown(event) {
    const button = event?.button ?? 0;
    if (![0, 2].includes(button)) return false;
    if (this.pointerId !== undefined) return false;
    const local = localPoint(this.element, event);
    this.element?.focus?.();
    this.pointerId = event?.pointerId;
    this.pointerButton = button;
    this.pointerToken = undefined;
    this.pointerStart = local;
    this.pointerLast = local;
    this.pointerMoved = false;
    this.setSelectionBox(null, null);
    // Select immediately so a left click cannot be swallowed by the token
    // movement setup that follows. A subsequent drag still commits movement.
    const token = button === 0 ? this.projectedTokenAt(local) : null;
    if (token) {
      this.pointerToken = token;
      this.selectAt(local);
    }
    if (button === 0) this.startTokenDrag(local, token);
    this.element?.setPointerCapture?.(this.pointerId);
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  handlePointerMove(event) {
    if (!samePointer(event, this.pointerId) || !this.pointerLast) return false;
    const local = localPoint(this.element, event);
    const fromStart = Math.hypot(
      local.x - this.pointerStart.x,
      local.y - this.pointerStart.y
    );
    if (!this.pointerMoved && fromStart < this.dragThreshold) return false;
    this.pointerMoved = true;
    const delta = {
      x: local.x - this.pointerLast.x,
      y: local.y - this.pointerLast.y
    };
    this.pointerLast = local;
    if (this.dragToken) this.previewTokenAt(local);
    else if (this.pointerButton === 2 || typeof this.onSelectionBoxChanged !== "function") {
      this.panBy(delta);
    } else this.setSelectionBox(this.pointerStart, local);
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  async handlePointerUp(event) {
    if (!samePointer(event, this.pointerId)) return false;
    const local = localPoint(this.element, event);
    const moved = this.pointerMoved;
    const button = this.pointerButton;
    const pointerToken = this.pointerToken;
    const draggingToken = this.dragToken !== undefined;
    const selectionBox = this.selectionBox;
    // Pointerup is not guaranteed to be preceded by a final pointermove.
    // Recompute the snapped destination from the release point so the commit
    // cannot use a stale preview from an earlier grid cell.
    if (draggingToken && moved) this.previewTokenAt(local);
    this.releasePointer();
    if (draggingToken) {
      if (moved) await this.enqueueAction(() => this.commitTokenDrag());
      else {
        this.clearDragState();
        this.setMovementPreview(null);
      }
    } else if (button === 0 && moved && selectionBox) {
      const selected = getProjectedTokensInSelectionBox(
        selectionBox,
        this.currentModel().tokens
      );
      this.onSelectionChanged?.(selected[0]?.tokenId ?? null, selected[0] ?? null);
      this.requestRender?.({ type: "selection", tokenId: selected[0]?.tokenId ?? null });
    } else if (button === 0 && !moved && !pointerToken) this.selectAt(local);
    this.setSelectionBox(null, null);
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  handlePointerCancel(event) {
    if (!samePointer(event, this.pointerId)) return false;
    this.cancelPointer();
    this.clearDragState();
    this.setMovementPreview(null);
    this.setSelectionBox(null, null);
    event?.stopPropagation?.();
    return true;
  }

  handleContextMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  handleWheel(event) {
    const factor = finiteOr(event?.deltaY, 0) < 0 ? this.zoomStep : 1 / this.zoomStep;
    // Wheel zoom changes scale around the current camera focus, so the grid
    // stays in place instead of shifting toward the pointer.
    this.setZoom(this.currentCamera().scale * factor);
    event?.preventDefault?.();
    event?.stopPropagation?.();
    return true;
  }

  releasePointer() {
    if (this.pointerId !== undefined) {
      this.element?.releasePointerCapture?.(this.pointerId);
    }
    this.pointerId = undefined;
    this.pointerStart = undefined;
    this.pointerLast = undefined;
    this.pointerMoved = false;
    this.pointerButton = undefined;
    this.pointerToken = undefined;
  }

  cancelPointer() {
    this.releasePointer();
  }

  panBy(delta) {
    const camera = this.currentCamera();
    if (!camera.view) return false;
    if (isometricView(camera.view)) {
      const currentPan = this.panel.pan ?? { x: 0, y: 0 };
      const pan = {
        x: finiteOr(currentPan.x, 0) + finiteOr(delta?.x, 0),
        y: finiteOr(currentPan.y, 0) + finiteOr(delta?.y, 0)
      };
      this.panel.pan = pan;
      this.notifyViewChanged({ type: "pan", pan });
      return true;
    }
    const center = camera.screenCenter;
    const nextFocus = this.projectionEngine.inversePoint({
      x: center.x - finiteOr(delta?.x, 0),
      y: center.y - finiteOr(delta?.y, 0)
    }, camera, { preserve: camera.focus });
    this.panel.focus = nextFocus;
    this.notifyViewChanged({ type: "pan", focus: nextFocus });
    return true;
  }

  setZoom(value, { focusPoint } = {}) {
    if (focusPoint) return this.zoomAt(focusPoint, value / this.currentCamera().scale);
    const zoom = clampLogicalZoom(value);
    this.panel.zoom = zoom;
    this.notifyViewChanged({ type: "zoom", zoom });
    return zoom;
  }

  zoomAt(screenPoint, factor) {
    const camera = this.currentCamera();
    if (!camera.view) return camera.scale;
    if (isometricView(camera.view)) {
      const zoom = clampLogicalZoom(camera.scale * finiteOr(factor, 1));
      this.panel.zoom = zoom;
      this.notifyViewChanged({ type: "zoom", zoom });
      return zoom;
    }
    const target = point(screenPoint);
    const targetWorld = this.projectionEngine.inversePoint(target, camera, {
      preserve: camera.focus
    });
    const zoom = clampLogicalZoom(camera.scale * finiteOr(factor, 1));
    const nextCamera = { ...camera, scale: zoom };
    const nextFocus = this.projectionEngine.inversePoint(target, nextCamera, {
      preserve: camera.focus
    });
    // Keep this explicit so a future projection adapter cannot accidentally
    // change the promised stable-focus behavior without failing this check.
    if (targetWorld && nextFocus) this.panel.focus = nextFocus;
    this.panel.zoom = zoom;
    this.notifyViewChanged({ type: "zoom", zoom, focus: this.panel.focus });
    return zoom;
  }

  zoomIn() {
    return this.setZoom(this.currentCamera().scale * this.zoomStep);
  }

  zoomOut() {
    return this.setZoom(this.currentCamera().scale / this.zoomStep);
  }

  resetView() {
    this.panel.focus = null;
    this.panel.pan = { x: 0, y: 0 };
    this.panel.zoom = DEFAULT_LOGICAL_ZOOM;
    this.notifyViewChanged({
      type: "reset-view",
      zoom: DEFAULT_LOGICAL_ZOOM,
      focus: null
    });
    return this.panel;
  }

  centerView() {
    this.panel.focus = null;
    this.panel.pan = { x: 0, y: 0 };
    this.notifyViewChanged({ type: "center-view", focus: null, pan: { x: 0, y: 0 } });
    return this.panel;
  }
}

export function createPanelInputController(options) {
  return new PanelInputController(options);
}
