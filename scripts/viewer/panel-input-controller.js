import { ProjectionEngine } from "../projection/projection-engine.js";
import { CoordinateAdapter } from "../model/coordinate-adapter.js";

/** Logical zoom is deliberately independent of the canvas backing-store DPR. */
export const MIN_LOGICAL_ZOOM = 16;
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
  const target = point(screenPoint);
  if (!Array.isArray(projectedTokens)) return null;

  return projectedTokens
    .filter((token) => token?.visibleToCurrentUser !== false && token?.culled !== true)
    .map((token, index) => {
      const tokenPoint = point(token.point, { x: NaN, y: NaN });
      const radius = finiteOr(token.markerRadius, 0);
      const distance = Math.hypot(target.x - tokenPoint.x, target.y - tokenPoint.y);
      return { token, index, radius, distance };
    })
    .filter(({ token, radius, distance }) => token?.tokenId !== undefined
      && radius > 0 && Number.isFinite(distance) && distance <= radius)
    .sort((left, right) => left.distance - right.distance || right.index - left.index)
    .at(0)?.token ?? null;
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
    getRenderModel,
    onSelectionChanged,
    onViewChanged,
    onMovementPreview,
    onActionResult,
    requestRender,
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
    this.getRenderModel = typeof getRenderModel === "function" ? getRenderModel : () => null;
    this.onSelectionChanged = onSelectionChanged;
    this.onViewChanged = onViewChanged;
    this.onMovementPreview = onMovementPreview;
    this.onActionResult = onActionResult;
    this.requestRender = requestRender;
    this.projectionEngine = projectionEngine;
    this.zoomStep = zoomStep > 1 ? zoomStep : LOGICAL_ZOOM_STEP;
    this.dragThreshold = Math.max(0, dragThreshold);
    this.pointerId = undefined;
    this.pointerStart = undefined;
    this.pointerLast = undefined;
    this.pointerMoved = false;
    this.dragToken = undefined;
    this.dragDocument = undefined;
    this.dragSnapshot = undefined;
    this.dragStartTactical = undefined;
    this.dragGrabOffset = undefined;
    this.movementPreview = undefined;
    this.attached = false;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.attach();
  }

  attach() {
    if (this.attached || !this.element?.addEventListener) return false;
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerCancel);
    this.element.addEventListener("wheel", this.handleWheel, { passive: false });
    this.attached = true;
    return true;
  }

  detach() {
    if (!this.attached) return false;
    this.element?.removeEventListener?.("pointerdown", this.handlePointerDown);
    this.element?.removeEventListener?.("pointermove", this.handlePointerMove);
    this.element?.removeEventListener?.("pointerup", this.handlePointerUp);
    this.element?.removeEventListener?.("pointercancel", this.handlePointerCancel);
    this.element?.removeEventListener?.("wheel", this.handleWheel);
    this.attached = false;
    this.cancelPointer();
    return true;
  }

  currentModel() {
    return this.getRenderModel() ?? {};
  }

  currentCamera() {
    const model = this.currentModel();
    const source = model.camera ?? {};
    return {
      ...source,
      view: model.view ?? source.view ?? "top",
      focus: this.panel.focus ?? source.focus ?? { x: 0, y: 0, z: 0 },
      scale: clampLogicalZoom(this.panel.zoom ?? source.scale ?? DEFAULT_LOGICAL_ZOOM),
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
    const token = this.projectedTokenAt(screenPoint);
    this.onSelectionChanged?.(token?.tokenId ?? null, token ?? null);
    this.requestRender?.({ type: "selection", tokenId: token?.tokenId ?? null });
    return token;
  }

  startTokenDrag(local, token) {
    if (this.currentCamera().view !== "top"
      || token?.visibleToCurrentUser === false
      || token?.canCurrentUserMove !== true) return false;
    const document = this.getTokenById(token.tokenId);
    if (!document || !this.scene
      || typeof this.tacticalUpdateService?.captureInteractionSnapshot !== "function") {
      return false;
    }

    const current = this.coordinateAdapter.toTactical(document, this.scene);
    const pointerTactical = this.projectionEngine.inversePoint(local, this.currentCamera(), {
      preserve: current.tacticalZ
    });
    this.dragToken = token;
    this.dragDocument = document;
    this.dragSnapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
    this.dragStartTactical = current;
    this.dragGrabOffset = {
      x: pointerTactical.x - current.tacticalX,
      y: pointerTactical.y - current.tacticalY
    };
    this.onSelectionChanged?.(token.tokenId, token);
    return true;
  }

  setMovementPreview(preview) {
    this.movementPreview = preview ?? undefined;
    this.onMovementPreview?.(preview ?? null);
    this.requestRender?.({ type: preview ? "movement-preview" : "movement-preview-cleared" });
  }

  previewTokenAt(local) {
    if (!this.dragDocument || !this.dragStartTactical || !this.dragGrabOffset) return false;
    const pointerTactical = this.projectionEngine.inversePoint(local, this.currentCamera(), {
      preserve: this.dragStartTactical.tacticalZ
    });
    const snapped = this.coordinateAdapter.snapTacticalAnchor(
      this.dragDocument,
      this.scene,
      {
        x: pointerTactical.x - this.dragGrabOffset.x,
        y: pointerTactical.y - this.dragGrabOffset.y
      }
    );
    const delta = {
      x: Math.round(snapped.tacticalX - this.dragStartTactical.tacticalX),
      y: Math.round(snapped.tacticalY - this.dragStartTactical.tacticalY)
    };
    if (delta.x === 0 && delta.y === 0) {
      this.setMovementPreview(null);
      return true;
    }
    this.setMovementPreview({
      tokenId: this.dragToken.tokenId,
      tacticalX: this.dragStartTactical.tacticalX + delta.x,
      tacticalY: this.dragStartTactical.tacticalY + delta.y,
      tacticalZ: this.dragStartTactical.tacticalZ,
      delta,
      position: snapped.position,
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
    this.clearDragState();
    if (!preview || !document || typeof this.tacticalUpdateService?.moveXY !== "function") {
      this.setMovementPreview(null);
      return null;
    }

    const result = await this.tacticalUpdateService.moveXY(
      document,
      this.scene,
      preview.delta,
      snapshot
    );
    this.setMovementPreview(null);
    this.onActionResult?.(result, token);
    return result;
  }

  handlePointerDown(event) {
    if (event?.button !== undefined && event.button !== 0) return false;
    if (this.pointerId !== undefined) return false;
    const local = localPoint(this.element, event);
    const token = this.projectedTokenAt(local);
    this.pointerId = event?.pointerId;
    this.pointerStart = local;
    this.pointerLast = local;
    this.pointerMoved = false;
    this.startTokenDrag(local, token);
    this.element?.setPointerCapture?.(this.pointerId);
    event?.preventDefault?.();
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
    else this.panBy(delta);
    event?.preventDefault?.();
    return true;
  }

  async handlePointerUp(event) {
    if (!samePointer(event, this.pointerId)) return false;
    const local = localPoint(this.element, event);
    const moved = this.pointerMoved;
    const draggingToken = this.dragToken !== undefined;
    this.releasePointer();
    if (draggingToken) {
      if (moved) await this.commitTokenDrag();
      else {
        this.clearDragState();
        this.setMovementPreview(null);
      }
    } else if (!moved) this.selectAt(local);
    event?.preventDefault?.();
    return true;
  }

  handlePointerCancel(event) {
    if (!samePointer(event, this.pointerId)) return false;
    this.cancelPointer();
    this.clearDragState();
    this.setMovementPreview(null);
    return true;
  }

  handleWheel(event) {
    const local = localPoint(this.element, event);
    const factor = finiteOr(event?.deltaY, 0) < 0 ? this.zoomStep : 1 / this.zoomStep;
    this.zoomAt(local, factor);
    event?.preventDefault?.();
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
  }

  cancelPointer() {
    this.releasePointer();
  }

  panBy(delta) {
    const camera = this.currentCamera();
    if (!camera.view || camera.view.startsWith("iso-")) return false;
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
    if (!camera.view || camera.view.startsWith("iso-")) return camera.scale;
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
    this.panel.zoom = DEFAULT_LOGICAL_ZOOM;
    this.notifyViewChanged({
      type: "reset-view",
      zoom: DEFAULT_LOGICAL_ZOOM,
      focus: null
    });
    return this.panel;
  }
}

export function createPanelInputController(options) {
  return new PanelInputController(options);
}
