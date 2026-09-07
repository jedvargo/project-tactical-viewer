import { ALLOWED_PITCHES, canonicalViewId, MODULE_ID } from "../constants.js";
import { ProjectionEngine } from "../projection/projection-engine.js";
import { isRenderableView } from "../rendering/canvas-renderer.js";
import { VIEW_REGISTRY } from "../view-registry.js";
import {
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  getPanelLayoutState,
  PANEL_COUNTS,
  clampSplitterProportion,
  defaultPanelAreas,
  normalizePanelCount,
  normalizePanelLayout
} from "./panel-layout.js";
import {
  DEFAULT_DISPLAY_MODE,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_STYLE,
  DEFAULT_OVERLAYS,
  DISPLAY_MODES,
  GRID_LINE_STYLES,
  normalizeDisplayMode,
  normalizeGridDimensions,
  normalizeBackground,
  normalizeGridOpacity,
  normalizeGridStyle,
  normalizedOverlays
} from "../persistence/migrations.js";
import {
  DEFAULT_LOGICAL_ZOOM,
  PanelInputController
} from "./panel-input-controller.js";
import { snapHeading } from "../model/orientation-math.js";
import { getTokenPitch } from "../model/token-flags.js";
import { localize, localizeFormat, viewLabel } from "../i18n.js";
import {
  getViewerDropData,
  localDropPoint,
  panelIndexForDropTarget,
  tokenDataForDrop
} from "./drop-handler.js";

function defaultFrameScheduler(callback) {
  if (typeof globalThis?.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0);
}

function defaultFrameCanceller(handle) {
  if (typeof globalThis?.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout(handle);
  }
}

function foundryApplicationV2() {
  return globalThis?.foundry?.applications?.api?.ApplicationV2
    ?? globalThis?.foundry?.applications?.api?.Application;
}

function fallbackApplicationV2() {
  return class ApplicationV2Fallback {
    constructor(options = {}) {
      this.options = options;
    }
  };
}

function documentFor(options) {
  return options.document
    ?? globalThis?.document;
}

function reducedMotionPreference() {
  return globalThis?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function viewFor(layout, index, registry) {
  const requested = layout?.panels?.[index]?.view;
  return registry.has(requested) && isRenderableView(requested) ? requested : "top";
}

function layoutFor(scene, persistenceService) {
  if (typeof persistenceService?.getSceneLayout !== "function") return {};
  return persistenceService.getSceneLayout(scene?.id) ?? {};
}

function cloneFocus(focus) {
  if (!focus || typeof focus !== "object") return null;
  if (!["x", "y", "z"].every((axis) => Number.isFinite(focus[axis]))) return null;
  return { x: focus.x, y: focus.y, z: focus.z };
}

function clonePan(pan) {
  return {
    x: Number.isFinite(pan?.x) ? pan.x : 0,
    y: Number.isFinite(pan?.y) ? pan.y : 0
  };
}

function isometricView(view) {
  return view === "isometric"
    || (typeof view === "string" && view.startsWith("iso-"));
}

function sameFocus(left, right) {
  return left && right
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z;
}

const SIDE_CONTROL_GUTTER = 8;
const DEFAULT_GRID_DIMENSIONS = Object.freeze({ x: 20, y: 20, z: 20 });

function sceneGridDimensions(scene) {
  const dimensions = scene?.dimensions ?? {};
  const grid = scene?.grid ?? {};
  const sizeX = Number(grid.sizeX ?? grid.size);
  const sizeY = Number(grid.sizeY ?? grid.size);
  const columns = Number(dimensions.width) / sizeX;
  const rows = Number(dimensions.height) / sizeY;
  return Number.isFinite(columns) && Number.isFinite(rows)
    ? { x: Math.max(1, Math.round(columns)), y: Math.max(1, Math.round(rows)), z: 10 }
    : null;
}

function viewportSize(document) {
  const documentWidth = Number(document?.documentElement?.clientWidth);
  const documentHeight = Number(document?.documentElement?.clientHeight);
  return {
    width: Number(globalThis?.innerWidth) || documentWidth || 1280,
    height: Number(globalThis?.innerHeight) || documentHeight || 720
  };
}

function sideControlElements(document) {
  const elements = [
    [globalThis?.ui?.controls?.element, "left"],
    [globalThis?.ui?.sidebar?.element, "right"],
    [document?.querySelector?.("#controls"), "left"],
    [document?.querySelector?.("#sidebar"), "right"]
  ].filter(([element]) => Boolean(element));
  const seen = new Set();
  return elements.filter(([element]) => {
    if (seen.has(element)) return false;
    seen.add(element);
    return true;
  }).map(([element, side]) => ({ element, side }));
}

/**
 * Find the horizontal space occupied by Foundry's scene controls and sidebar.
 * These elements are outside the ApplicationV2 window and must be excluded
 * when the viewer fills the available workspace.
 */
export function getSideControlInsets(document, size = viewportSize(document)) {
  const width = Number(size?.width) || 0;
  const height = Number(size?.height) || 0;
  let left = 0;
  let right = 0;

  for (const { element, side } of sideControlElements(document)) {
    if (element.hidden === true) continue;
    const rect = element.getBoundingClientRect?.();
    if (!rect) continue;
    const rectLeft = Number(rect.left);
    const rectRight = Number(rect.right ?? (rectLeft + Number(rect.width)));
    const rectWidth = Number(rect.width) || rectRight - rectLeft;
    const rectHeight = Number(rect.height) || Number(rect.bottom) - Number(rect.top);
    if (!(rectWidth > 0) || !(rectHeight > 0) || !(width > 0) || !(height > 0)) continue;

    if (side === "left" && rectRight > 0) {
      left = Math.max(left, Math.min(width, rectRight + SIDE_CONTROL_GUTTER));
    }
    if (side === "right" && rectLeft < width) {
      right = Math.max(right, Math.min(width, width - rectLeft + SIDE_CONTROL_GUTTER));
    }
  }

  return {
    left,
    right: Math.min(right, Math.max(0, width - left)),
    top: 0,
    bottom: 0
  };
}

function makeState(scene, persistenceService, registry) {
  const layout = normalizePanelLayout(layoutFor(scene, persistenceService));
  return {
    selectedTokenId: null,
    selectionBox: null,
    movementPreview: null,
    sharedFocus: null,
    sharedPan: { x: 0, y: 0 },
    sharedZoom: DEFAULT_LOGICAL_ZOOM,
    // Keep the rendered tactical grid aligned with the Scene coordinate
    // adapter unless the user has explicitly saved a viewer grid size.
    gridDimensions: normalizeGridDimensions(layout.gridDimensions)
      ?? sceneGridDimensions(scene)
      ?? { ...DEFAULT_GRID_DIMENSIONS },
    background: normalizeBackground(layout.background),
    displayMode: normalizeDisplayMode(layout.displayMode, DEFAULT_DISPLAY_MODE),
    panelCount: layout.panelCount,
    splits: layout.splits.slice(),
    links: {
      selection: layout.links?.selection ?? true,
      center: layout.links?.center ?? true,
      zoom: layout.links?.zoom ?? true
    },
    responsive: getPanelLayoutState(layout.panelCount, 0),
    reducedMotion: false,
    panels: layout.panels.map((panel, index) => ({
      view: viewFor(layout, index, registry),
      dimensions: { width: 0, height: 0 },
      pan: { x: 0, y: 0 },
      // Transient session state is intentionally not read from persistence.
      zoom: DEFAULT_LOGICAL_ZOOM,
      fitToPanel: true,
      focus: null,
      selectedTokenId: null,
      overlays: normalizedOverlays(panel.overlays)
    }))
  };
}

function sceneTokenById(scene, tokenId) {
  const tokens = scene?.tokens;
  if (typeof tokens?.get === "function") return tokens.get(tokenId);
  if (Array.isArray(tokens)) return tokens.find((token) => token?.id === tokenId);
  if (tokens && typeof tokens === "object") return tokens[tokenId];
  return null;
}

function actionMessage(result) {
  if (result?.status === "conflict") return localize("actions.conflict", "Token changed remotely; movement canceled.");
  if (result?.adjusted === true) return localize("actions.adjusted", "Foundry adjusted the token to an accepted position.");
  if (result?.reason === "isometric-movement-disabled") {
    return localize("actions.isometricReadOnly", "Isometric views are read-only; move tokens from an orthographic view.");
  }
  if (result?.reason === "rotation-locked") return localize("actions.rotationLocked", "Token rotation is locked.");
  if (result?.reason === "locked") return localize("actions.movementLocked", "Token movement is locked.");
  if (result?.reason === "permission") return localize("actions.permission", "You cannot update this token.");
  if (result?.reason === "drop-isometric") return localize("actions.dropIsometric", "Drop tokens onto an orthographic panel; isometric placement is ambiguous.");
  if (result?.reason === "drop-invalid") return localize("actions.dropInvalid", "That item cannot be dropped into Tactical Viewer.");
  if (result?.reason === "drop-permission") return localize("actions.dropPermission", "You cannot create a token in this Scene.");
  if (result?.reason === "drop-unavailable") return localize("actions.dropUnavailable", "Token creation is unavailable for this Scene.");
  if (result?.reason === "invalid-size") return localize("actions.invalidSize", "Token size must be between 1 and 20 squares.");
  if (result?.status === "rejected") return localize("actions.rejected", "Token update was rejected.");
  return "";
}

function addClass(element, className) {
  element.classList?.add?.(className);
}

function setRole(element, role) {
  element.dataset.role = role;
  element.setAttribute?.("data-role", role);
}

function makeButton(document, label, role, ariaLabel = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute?.("aria-label", ariaLabel);
  if (role) setRole(button, role);
  return button;
}

/**
 * Create the viewer class against a supplied ApplicationV2 constructor.
 * The factory keeps controller tests independent of a Foundry process while
 * the exported class resolves Foundry's public v14 ApplicationV2 at runtime.
 */
export function createTacticalViewerApplicationClass({
  ApplicationV2 = foundryApplicationV2() ?? fallbackApplicationV2()
} = {}) {
  return class TacticalViewerApplication extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      ...(ApplicationV2.DEFAULT_OPTIONS ?? {}),
      id: `${MODULE_ID}-application`,
      classes: ["tactical-3d-viewer", "tactical-3d-viewer-application"],
      position: { width: 800, height: 600 },
      window: { title: localize("viewer.title", "3D Tactical Viewer"), resizable: true }
    };

    constructor(options = {}) {
      const {
        scene,
        persistenceService,
        synchronizationCoordinator,
        tacticalStateService,
        tacticalUpdateService,
        coordinateAdapter,
        viewRegistry = VIEW_REGISTRY,
        scheduler = defaultFrameScheduler,
        cancelScheduler = defaultFrameCanceller,
        document,
        devicePixelRatio,
        renderer,
        onClosed,
        reducedMotion,
        projectionEngine = new ProjectionEngine(),
        ...applicationOptions
      } = options;

      if (!scene || typeof scene !== "object") {
        throw new TypeError("TacticalViewerApplication requires a Scene");
      }

      super(applicationOptions);
      this.scene = scene;
      this.persistenceService = persistenceService;
      this.synchronizationCoordinator = synchronizationCoordinator;
      this.tacticalStateService = tacticalStateService;
      this.tacticalUpdateService = tacticalUpdateService;
      this.coordinateAdapter = coordinateAdapter ?? tacticalUpdateService?.coordinateAdapter;
      this.viewRegistry = viewRegistry;
      this.domDocument = document ?? documentFor({ document });
      this.scheduler = scheduler;
      this.cancelScheduler = cancelScheduler;
      this.devicePixelRatio = Number.isFinite(devicePixelRatio)
        ? Math.max(1, devicePixelRatio)
        : Math.max(1, globalThis?.devicePixelRatio ?? 1);
      this.renderer = renderer;
      this.onClosed = onClosed;
      this.reducedMotionOverride = typeof reducedMotion === "boolean" ? reducedMotion : undefined;
      this.projectionEngine = projectionEngine;
      this.viewerState = makeState(scene, persistenceService, viewRegistry);
      this.viewport = { width: 0, height: 0 };
      this.renderCount = 0;
      this.renderScheduled = false;
      this.scheduledHandle = undefined;
      this.lastInvalidation = undefined;
      this.unsubscribeSynchronization = undefined;
      this.resizeObservers = [];
      this.sideControlResizeObservers = [];
      this.sideControlInsets = { left: 0, right: 0, top: 0, bottom: 0 };
      this.canvases = [];
      this.panelElements = [];
      this.panelGridElement = undefined;
      this.panelCountSelect = undefined;
      this.zoomLabel = undefined;
      this.centerButtons = [];
      this.sharedOptionsElement = undefined;
      this.backgroundControls = {};
      this.selectedTokenReadout = undefined;
      this.actionMessageElement = undefined;
      this.responsiveWarning = undefined;
      this.overlapChooserElement = undefined;
      this.overlapChooserSelect = undefined;
      this.overlapChooserCandidates = [];
      this.overlapChooserPanelIndex = 0;
      this.linkControls = {};
      this.inputControllers = [];
      this.panelActionQueues = [];
      this.attached = false;
      this.shellElement = undefined;
      this.handleDragOver = this.handleDragOver.bind(this);
      this.handleViewerDrop = this.handleViewerDrop.bind(this);
      this.handleWorkspaceResize = this.handleWorkspaceResize.bind(this);
    }

    get panelCount() {
      return this.viewerState.panelCount;
    }

    getViewportDimensions() {
      return { ...this.viewerState.panels[0].dimensions };
    }

    getSharedFocus() {
      const explicit = cloneFocus(this.viewerState.sharedFocus);
      if (explicit) return explicit;

      const panelFocus = cloneFocus(this.viewerState.panels[0]?.focus);
      if (panelFocus) return panelFocus;

      try {
        if (this.viewerState.gridDimensions) {
          const dimensions = this.viewerState.gridDimensions;
          return {
            x: (dimensions.x ?? dimensions.columns) / 2,
            y: (dimensions.y ?? dimensions.rows) / 2,
            z: (dimensions.z ?? dimensions.depth ?? 10) / 2
          };
        }
        const grid = this.coordinateAdapter?.getTopGrid?.(this.scene);
        if (grid) return {
          x: grid.columns / 2,
          y: grid.rows / 2,
          z: 5
        };
      } catch {
        // A custom/test renderer may not have a Foundry grid; its own camera
        // default remains authoritative until the first linked pan.
      }
      return null;
    }

    initializeSharedFocus() {
      if (!this.viewerState.links.center || cloneFocus(this.viewerState.sharedFocus)) return;
      const focus = this.getSharedFocus();
      if (!focus) return;
      this.viewerState.sharedFocus = focus;
      this.viewerState.panels.forEach((panel) => { panel.focus = { ...focus }; });
    }

    getPanelRenderState(index) {
      const panel = this.viewerState.panels[index] ?? this.viewerState.panels[0];
      if (!panel) return panel;
      return {
        ...panel,
        focus: this.viewerState.links.center ? this.getSharedFocus() : panel.focus,
        pan: this.viewerState.links.center ? clonePan(this.viewerState.sharedPan) : clonePan(panel.pan),
        zoom: panel.fitToPanel === true
          ? undefined
          : (this.viewerState.links.zoom ? this.viewerState.sharedZoom : panel.zoom)
      };
    }

    getSelectedTokenId(panelIndex = 0) {
      const panel = this.viewerState.panels[panelIndex] ?? this.viewerState.panels[0];
      return this.viewerState.links.selection
        ? this.viewerState.selectedTokenId
        : (panel?.selectedTokenId ?? null);
    }

    getPanelZoom(index = 0) {
      const panel = this.viewerState.panels[index] ?? this.viewerState.panels[0];
      if (!panel) return DEFAULT_LOGICAL_ZOOM;
      if (panel.fitToPanel === true) {
        const fitted = this.buildRenderModel(undefined, index)?.camera?.scale;
        if (Number.isFinite(fitted)) return fitted;
      }
      return Number.isFinite(panel.zoom) ? panel.zoom : DEFAULT_LOGICAL_ZOOM;
    }

    getVisibleTacticalStates() {
      return (this.tacticalStateService?.getVisibleTacticalStates?.(this.scene) ?? [])
        .filter((state) => state?.visibleToCurrentUser === true);
    }

    handleDragOver(event) {
      if (panelIndexForDropTarget(event?.target) < 0) return false;
      event.preventDefault?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      return true;
    }

    async handleViewerDrop(event) {
      const panelIndex = panelIndexForDropTarget(event?.target ?? event?.currentTarget);
      if (panelIndex < 0) return null;
      event.preventDefault?.();
      const panel = this.viewerState.panels[panelIndex];
      const canvas = this.canvases[panelIndex];
      if (!panel || !canvas) return null;

      const model = this.buildRenderModel(undefined, panelIndex);
      if (!model?.camera || isometricView(panel.view)) {
        const result = { status: "rejected", reason: "drop-isometric" };
        if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
        return result;
      }

      const dropData = getViewerDropData(event);
      let tokenData;
      try {
        tokenData = await tokenDataForDrop(dropData);
      } catch {
        tokenData = null;
      }
      if (!tokenData) {
        const result = { status: "rejected", reason: "drop-invalid" };
        if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
        return result;
      }
      if (typeof this.scene?.createEmbeddedDocuments !== "function") {
        const result = { status: "rejected", reason: "drop-unavailable" };
        if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
        return result;
      }
      const user = globalThis?.game?.user;
      if (typeof this.scene.canUserModify === "function"
        ? this.scene.canUserModify(user, "create", tokenData) !== true
        : user?.isGM !== true) {
        const result = { status: "rejected", reason: "drop-permission" };
        if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
        return result;
      }

      const local = localDropPoint(event, canvas);
      if (!local) return { status: "rejected", reason: "drop-invalid" };
      try {
        const point = this.projectionEngine.inversePoint(local, model.camera, {
          preserve: model.camera.focus
        });
        const width = Number.isFinite(tokenData.width) && tokenData.width > 0
          ? tokenData.width
          : 1;
        const height = Number.isFinite(tokenData.height) && tokenData.height > 0
          ? tokenData.height
          : 1;
        const tokenForPosition = { ...tokenData, width, height, x: 0, y: 0 };
        const grid = model.grid ?? {};
        const columns = Number(grid.columns);
        const rows = Number(grid.rows);
        const depth = Number(grid.depth ?? grid.z);
        const tokenDepth = Math.max(1, Number(tokenData.depth) || 1);
        const boundedPoint = {
          ...point,
          x: Number.isFinite(columns)
            ? Math.min(columns - width / 2, Math.max(width / 2, point.x))
            : point.x,
          y: Number.isFinite(rows)
            ? Math.min(rows - height / 2, Math.max(height / 2, point.y))
            : point.y,
          z: Number.isFinite(depth)
            ? Math.min(depth - tokenDepth, Math.max(0, Math.round(Number(point.z) || 0)))
            : point.z
        };
        const snapped = typeof this.coordinateAdapter.snapTacticalAnchor === "function"
          ? this.coordinateAdapter.snapTacticalAnchor(tokenForPosition, this.scene, boundedPoint)
          : null;
        const position = snapped?.position ?? this.coordinateAdapter.toTokenPosition(
          tokenForPosition,
          this.scene,
          {
            x: Math.round(boundedPoint.x - width / 2) + width / 2,
            y: Math.round(boundedPoint.y - height / 2) + height / 2
          },
          { clampToGrid: true }
        );
        tokenData.x = position.x;
        tokenData.y = position.y;
        tokenData.elevation = this.coordinateAdapter.toElevation(boundedPoint.z, this.scene);
        tokenData.flags = {
          ...(tokenData.flags ?? {}),
          [MODULE_ID]: { ...(tokenData.flags?.[MODULE_ID] ?? {}), enabled: true }
        };
        const created = await this.scene.createEmbeddedDocuments("Token", [tokenData]);
        this.refreshFromDocuments({ render: false });
        this.requestRender({ type: "token-drop", panelIndex });
        return { status: "accepted", document: created?.[0] ?? null };
      } catch (error) {
        const result = { status: "rejected", reason: "drop-invalid", error };
        if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
        return result;
      }
    }

    /** Rebuild disposable view state from the current Scene TokenDocuments. */
    refreshFromDocuments({ render = true } = {}) {
      const states = this.getVisibleTacticalStates();
      this.reconcileSelection(states);
      this.updateSelectedTokenReadout(states);
      this.updateInteractionControls(states);
      if (render) this.requestRender({ type: "document-refresh" });
      return states;
    }

    reconnect(options = {}) {
      this.renderer?.invalidate?.({ type: "reconnect" });
      const states = this.refreshFromDocuments({ render: false });
      if (options.render !== false) this.requestRender({ type: "reconnect" });
      return states;
    }

    reconcileSelection(visibleTacticalStates) {
      const visibleIds = new Set((visibleTacticalStates ?? []).map((state) => state?.tokenId));
      if (this.viewerState.links.selection) {
        if (this.viewerState.selectedTokenId !== null && !visibleIds.has(this.viewerState.selectedTokenId)) {
          this.viewerState.selectedTokenId = null;
        }
        this.viewerState.panels.forEach((panel) => {
          panel.selectedTokenId = this.viewerState.selectedTokenId;
        });
        return;
      }
      this.viewerState.panels.forEach((panel) => {
        if (panel.selectedTokenId !== null && !visibleIds.has(panel.selectedTokenId)) {
          panel.selectedTokenId = null;
        }
      });
      if (this.viewerState.selectedTokenId !== null && !visibleIds.has(this.viewerState.selectedTokenId)) {
        this.viewerState.selectedTokenId = null;
      }
    }

    handleSynchronizationInvalidation(invalidation) {
      const deletedIds = invalidation?.deletedTokenIds ?? [];
      if (deletedIds.length > 0) {
        const deleted = new Set(deletedIds);
        if (deleted.has(this.viewerState.selectedTokenId)) this.viewerState.selectedTokenId = null;
        this.viewerState.panels.forEach((panel) => {
          if (deleted.has(panel.selectedTokenId)) panel.selectedTokenId = null;
        });
      }
      this.requestRender(invalidation);
    }

    buildRenderModel(
      visibleTacticalStates = this.getVisibleTacticalStates(),
      panelIndex = 0
    ) {
      const panel = this.viewerState.panels[panelIndex] ?? this.viewerState.panels[0];
      return this.renderer?.buildModel?.({
        canvas: this.canvases[panelIndex],
        context: this.canvases[panelIndex]?.getContext?.("2d"),
        scene: this.scene,
        viewport: panel.dimensions,
        state: this.viewerState,
        panelIndex,
        panel: this.getPanelRenderState(panelIndex),
        selectedTokenId: this.getSelectedTokenId(panelIndex),
        selectionBox: this.viewerState.selectionBox?.panelIndex === panelIndex
          ? this.viewerState.selectionBox
          : null,
        devicePixelRatio: this.devicePixelRatio,
        visibleTacticalStates,
        gridDimensions: this.viewerState.gridDimensions,
        background: this.viewerState.background
      }) ?? null;
    }

    updateZoomLabel() {
      this.panelElements.forEach((panelElement, index) => {
        const label = panelElement.querySelector?.('[data-role="zoom-label"]');
        const panel = this.getPanelRenderState(index);
        if (!label || !panel) return;
        const zoom = this.getPanelZoom(index);
        label.textContent = localizeFormat(
          "viewer.zoomLabel",
          `${Math.round(zoom)} px/cell`,
          { zoom: Math.round(zoom) }
        );
      });
      if (this.zoomLabel && !this.panelElements.length) {
        const zoom = this.getPanelZoom(0);
        this.zoomLabel.textContent = localizeFormat(
          "viewer.zoomLabel",
          `${Math.round(zoom)} px/cell`,
          { zoom: Math.round(zoom) }
        );
      }
    }

    updateSelectedTokenReadout(visibleTacticalStates = this.getVisibleTacticalStates()) {
      if (!this.selectedTokenReadout) return;
      const states = Array.isArray(visibleTacticalStates) ? visibleTacticalStates : [];
      const selected = states.find((state) =>
        state?.tokenId === this.getSelectedTokenId(0)
      );
      if (!selected) {
        if (this.getSelectedTokenId(0) !== null) {
          this.viewerState.selectedTokenId = null;
          if (this.viewerState.links.selection) {
            this.viewerState.panels.forEach((panel) => { panel.selectedTokenId = null; });
          } else {
            this.viewerState.panels[0].selectedTokenId = null;
          }
        }
        this.selectedTokenReadout.textContent = localize("viewer.readout.none", "No tactical token selected");
        return;
      }
      const label = selected.name || selected.tokenId;
      this.selectedTokenReadout.textContent = localizeFormat(
        "viewer.readout.selected",
        `Selected ${label} · X ${selected.tacticalX} · Y ${selected.tacticalY} · Z ${selected.tacticalZ}`,
        { label, x: selected.tacticalX, y: selected.tacticalY, z: selected.tacticalZ }
      );
    }

    handleSelectionChanged(tokenId, panelIndex = 0) {
      const panel = this.viewerState.panels[panelIndex] ?? this.viewerState.panels[0];
      if (!panel) return;
      if (this.viewerState.links.selection) {
        this.viewerState.selectedTokenId = tokenId ?? null;
        this.viewerState.panels.forEach((entry) => {
          entry.selectedTokenId = tokenId ?? null;
        });
      } else {
        panel.selectedTokenId = tokenId ?? null;
        if (panelIndex === 0) this.viewerState.selectedTokenId = tokenId ?? null;
      }
      this.updateSelectedTokenReadout();
      this.updateInteractionControls();
      this.requestRender({
        type: "selection",
        tokenId: tokenId ?? null,
        panelIndex
      });
    }

    handleSelectionBoxChanged(selectionBox, panelIndex = 0) {
      this.viewerState.selectionBox = selectionBox
        ? { ...selectionBox, panelIndex }
        : null;
      this.requestRender({
        type: selectionBox ? "selection-box" : "selection-box-cleared",
        panelIndex
      });
    }

    hideOverlapChooser() {
      if (this.overlapChooserElement) this.overlapChooserElement.hidden = true;
      this.overlapChooserCandidates = [];
    }

    showOverlapChooser(panelIndex, candidates = []) {
      const visibleCandidates = candidates
        .filter((candidate) => candidate?.visibleToCurrentUser === true)
        .filter((candidate) => candidate?.tokenId !== undefined && candidate?.tokenId !== null)
        .slice()
        .sort((left, right) => {
          const leftId = String(left.tokenId);
          const rightId = String(right.tokenId);
          return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
        });
      if (visibleCandidates.length < 2 || !this.overlapChooserElement || !this.overlapChooserSelect) {
        this.hideOverlapChooser();
        return false;
      }
      const select = this.overlapChooserSelect;
      if (typeof select.replaceChildren === "function") select.replaceChildren();
      else if (Array.isArray(select.children)) select.children.length = 0;
      for (const candidate of visibleCandidates) {
        const option = this.domDocument.createElement("option");
        option.value = String(candidate.tokenId);
        const label = candidate.name || candidate.tokenId;
        const axis = candidate.hiddenAxisLabel
          ? ` · ${candidate.hiddenAxisLabel}=${candidate.hiddenAxisValue}`
          : "";
        option.textContent = `${label}${axis}`;
        select.appendChild(option);
      }
      select.value = String(visibleCandidates[0].tokenId);
      this.overlapChooserCandidates = visibleCandidates;
      this.overlapChooserPanelIndex = panelIndex;
      this.overlapChooserElement.hidden = false;
      select.focus?.();
      return true;
    }

    getSelectedTacticalState(panelIndex = 0) {
      const selectedTokenId = this.getSelectedTokenId(panelIndex);
      return this.getVisibleTacticalStates().find((state) =>
        state?.tokenId === selectedTokenId
      );
    }

    getTokenById(tokenId) {
      return sceneTokenById(this.scene, tokenId);
    }

    serializeLayout() {
      return {
        panelCount: this.viewerState.panelCount,
        panels: this.viewerState.panels.map((panel) => ({
          view: panel.view,
          overlays: { ...panel.overlays }
        })),
        splits: this.viewerState.splits.slice(),
        links: { ...this.viewerState.links },
        gridDimensions: this.viewerState.gridDimensions
          ? {
            x: this.viewerState.gridDimensions.x ?? this.viewerState.gridDimensions.columns,
            y: this.viewerState.gridDimensions.y ?? this.viewerState.gridDimensions.rows,
            z: this.viewerState.gridDimensions.z ?? this.viewerState.gridDimensions.depth ?? 10
          }
          : null,
        background: normalizeBackground(this.viewerState.background),
        displayMode: this.viewerState.displayMode
      };
    }

    updateLinkControls() {
      for (const [key, control] of Object.entries(this.linkControls)) {
        if (control) control.checked = this.viewerState.links[key] === true;
      }
    }

    async setLinkSelection(enabled) {
      this.viewerState.links.selection = enabled === true;
      if (this.viewerState.links.selection) {
        const selected = this.viewerState.panels[0]?.selectedTokenId
          ?? this.viewerState.selectedTokenId
          ?? null;
        this.viewerState.selectedTokenId = selected;
        this.viewerState.panels.forEach((panel) => { panel.selectedTokenId = selected; });
      }
      this.updateLinkControls();
      await this.persistLayout();
      this.requestRender({ type: "link-selection", enabled: this.viewerState.links.selection });
      return this.viewerState.links.selection;
    }

    async setLinkCenter(enabled) {
      const wasLinked = this.viewerState.links.center;
      this.viewerState.links.center = enabled === true;
      const focus = this.viewerState.links.center && !wasLinked
        ? (cloneFocus(this.viewerState.panels[0]?.focus) ?? this.getSharedFocus())
        : this.getSharedFocus();
      if (focus) {
        this.viewerState.sharedFocus = focus;
        this.viewerState.panels.forEach((panel) => { panel.focus = { ...focus }; });
      }
      const pan = this.viewerState.links.center && !wasLinked
        ? clonePan(this.viewerState.panels[0]?.pan)
        : clonePan(this.viewerState.sharedPan);
      this.viewerState.sharedPan = pan;
      if (this.viewerState.links.center) {
        this.viewerState.panels.forEach((panel) => { panel.pan = { ...pan }; });
      }
      this.updateLinkControls();
      await this.persistLayout();
      this.requestRender({ type: "link-center", enabled: this.viewerState.links.center });
      return this.viewerState.links.center;
    }

    async setLinkZoom(enabled) {
      this.viewerState.links.zoom = enabled === true;
      const zoom = this.viewerState.links.zoom
        ? this.getPanelZoom(0)
        : (Number.isFinite(this.viewerState.panels[0]?.zoom)
          ? this.viewerState.panels[0].zoom
          : this.viewerState.sharedZoom);
      this.viewerState.sharedZoom = zoom;
      if (this.viewerState.links.zoom) {
        this.viewerState.panels.forEach((panel) => {
          panel.zoom = zoom;
          panel.fitToPanel = false;
        });
      }
      this.updateLinkControls();
      this.updateZoomLabel();
      await this.persistLayout();
      this.requestRender({ type: "link-zoom", enabled: this.viewerState.links.zoom });
      return this.viewerState.links.zoom;
    }

    async setLink(key, enabled) {
      if (key === "selection") return this.setLinkSelection(enabled);
      if (key === "center") return this.setLinkCenter(enabled);
      if (key === "zoom") return this.setLinkZoom(enabled);
      return false;
    }

    handlePanelViewChanged(panelIndex, change) {
      const panel = this.viewerState.panels[panelIndex];
      if (!panel || !change) return;
      if (change.type === "pan" && change.pan) {
        const pan = clonePan(change.pan);
        panel.pan = pan;
        if (this.viewerState.links.center) {
          this.viewerState.sharedPan = pan;
          this.viewerState.panels.forEach((entry) => { entry.pan = { ...pan }; });
        }
      } else if (change.type === "pan" && change.focus) {
        const focus = cloneFocus(change.focus);
        if (focus) {
          panel.focus = focus;
          if (this.viewerState.links.center) {
            this.viewerState.sharedFocus = focus;
            this.viewerState.panels.forEach((entry) => { entry.focus = { ...focus }; });
          }
        }
      } else if (change.type === "reset-view" || change.type === "center-view") {
        panel.focus = null;
        panel.pan = { x: 0, y: 0 };
        if (this.viewerState.links.center) {
          this.viewerState.sharedFocus = null;
          this.viewerState.sharedPan = { x: 0, y: 0 };
          this.viewerState.panels.forEach((entry) => { entry.focus = null; });
          this.viewerState.panels.forEach((entry) => { entry.pan = { x: 0, y: 0 }; });
        }
      }

      if (change.type === "zoom" && Number.isFinite(change.zoom)) {
        panel.zoom = change.zoom;
        panel.fitToPanel = false;
        if (this.viewerState.links.zoom) {
          this.viewerState.sharedZoom = change.zoom;
          this.viewerState.panels.forEach((entry) => {
            entry.zoom = change.zoom;
            entry.fitToPanel = false;
          });
        }
      } else if (change.type === "reset-view") {
        panel.zoom = DEFAULT_LOGICAL_ZOOM;
        panel.fitToPanel = false;
        if (this.viewerState.links.zoom) {
          this.viewerState.sharedZoom = DEFAULT_LOGICAL_ZOOM;
          this.viewerState.panels.forEach((entry) => {
            entry.zoom = DEFAULT_LOGICAL_ZOOM;
            entry.fitToPanel = false;
          });
        }
      }
      this.updateZoomLabel();
    }

    persistLayout() {
      if (typeof this.persistenceService?.saveSceneLayout !== "function") return null;
      return this.persistenceService.saveSceneLayout(
        this.scene.id,
        this.serializeLayout()
      );
    }

    async setPanelCount(value) {
      const panelCount = normalizePanelCount(Number(value), this.viewerState.panelCount);
      if (panelCount === this.viewerState.panelCount) return panelCount;
      this.viewerState.panelCount = panelCount;
      await this.persistLayout();
      if (this.attached && typeof this.render === "function") await this.render(true);
      return panelCount;
    }

    async setPanelView(index, view) {
      if (!Number.isInteger(index) || index < 0 || index >= this.viewerState.panels.length) {
        return false;
      }
      const canonical = canonicalViewId(view);
      if (!this.viewRegistry.has(canonical) || !isRenderableView(canonical)) return false;
      this.viewerState.panels[index].view = canonical;
      await this.persistLayout();
      this.updatePanelControls(index);
      this.updateInteractionControls();
      this.requestRender({ type: "view-change", panelIndex: index, view: canonical });
      return true;
    }

    async setPanelOverlay(index, key, enabled) {
      const panel = this.viewerState.panels[index];
      if (!panel || !Object.hasOwn(DEFAULT_OVERLAYS, key)
        || key === "gridOpacity" || key === "gridStyle") return false;
      panel.overlays[key] = enabled === true;
      await this.persistLayout();
      this.requestRender({ type: "overlay-change", panelIndex: index, key });
      return true;
    }

    async setPanelGridOpacity(index, value, { persist = true } = {}) {
      const panel = this.viewerState.panels[index];
      if (!panel) return false;
      panel.overlays.gridOpacity = normalizeGridOpacity(value);
      const control = this.panelElements[index]?.querySelector?.('[data-role="grid-opacity"]');
      const output = this.panelElements[index]?.querySelector?.('[data-role="grid-opacity-value"]');
      if (control) control.value = String(Math.round(panel.overlays.gridOpacity * 100));
      if (output) output.textContent = `${Math.round(panel.overlays.gridOpacity * 100)}%`;
      if (persist) await this.persistLayout();
      this.requestRender({ type: "grid-opacity-change", panelIndex: index });
      return panel.overlays.gridOpacity;
    }

    async setPanelGridStyle(index, value) {
      const panel = this.viewerState.panels[index];
      if (!panel) return false;
      panel.overlays.gridStyle = normalizeGridStyle(value);
      const control = this.panelElements[index]?.querySelector?.('[data-role="grid-style"]');
      if (control) control.value = panel.overlays.gridStyle;
      await this.persistLayout();
      this.renderer?.invalidate?.({ type: "scene-update" });
      this.requestRender({ type: "grid-style-change", panelIndex: index });
      return panel.overlays.gridStyle;
    }

    sceneGridDimensions() {
      return sceneGridDimensions(this.scene);
    }

    updateGridDimensionControls() {
      const dimensions = this.viewerState.gridDimensions ?? this.sceneGridDimensions();
      for (const [role, value] of [["grid-x", dimensions?.x ?? dimensions?.columns], ["grid-y", dimensions?.y ?? dimensions?.rows], ["grid-z", dimensions?.z ?? dimensions?.depth ?? 10]]) {
        const control = this.shellElement?.querySelector?.(`[data-role="${role}"]`);
        if (control && Number.isFinite(value)) control.value = String(value);
      }
    }

    async setGridDimensions(x, y, z = 10) {
      const previous = this.viewerState.gridDimensions;
      const normalized = normalizeGridDimensions({ x: Number(x), y: Number(y), z: Number(z) });
      if (!normalized) return false;
      this.viewerState.gridDimensions = normalized;
      const previousCenter = previous && {
        x: (previous.x ?? previous.columns) / 2,
        y: (previous.y ?? previous.rows) / 2,
        z: (previous.z ?? previous.depth ?? 10) / 2
      };
      const nextCenter = {
        x: normalized.x / 2,
        y: normalized.y / 2,
        z: normalized.z / 2
      };
      if (sameFocus(this.viewerState.sharedFocus, previousCenter)) {
        this.viewerState.sharedFocus = nextCenter;
        this.viewerState.panels.forEach((panel) => { panel.focus = { ...nextCenter }; });
      }
      this.updateGridDimensionControls();
      await this.persistLayout();
      this.renderer?.invalidate?.({ type: "scene-update" });
      this.requestRender({ type: "grid-dimensions-change", gridDimensions: normalized });
      return {
        x: normalized.x,
        y: normalized.y,
        z: normalized.z
      };
    }

    async setBackground(value = {}) {
      this.viewerState.background = normalizeBackground(value);
      const color = this.sharedOptionsElement?.querySelector?.('[data-role="background-color"]');
      const image = this.sharedOptionsElement?.querySelector?.('[data-role="background-image"]');
      if (color) color.value = this.viewerState.background.color;
      if (image) image.value = this.viewerState.background.image;
      await this.persistLayout();
      this.renderer?.invalidate?.({ type: "scene-update" });
      this.requestRender({ type: "background-change" });
      return this.viewerState.background;
    }

    async setDisplayMode(mode) {
      if (!DISPLAY_MODES.includes(mode)) return false;
      this.viewerState.displayMode = mode;
      this.applyDisplayMode();
      await this.persistLayout();
      return mode;
    }

    updateSideControlInsets() {
      const next = getSideControlInsets(this.domDocument);
      this.sideControlInsets = next;
      if (this.shellElement?.style?.setProperty) {
        this.shellElement.style.setProperty("--tactical-side-left", `${next.left}px`);
        this.shellElement.style.setProperty("--tactical-side-right", `${next.right}px`);
        this.shellElement.style.setProperty("--tactical-side-top", `${next.top}px`);
        this.shellElement.style.setProperty("--tactical-side-bottom", `${next.bottom}px`);
      }
      return next;
    }

    applyDisplayMode() {
      const mode = this.viewerState.displayMode;
      if (this.shellElement) this.shellElement.dataset.displayMode = mode;
      const dimensions = this.scene?.dimensions ?? {};
      const sceneWidth = Number(dimensions.width);
      const sceneHeight = Number(dimensions.height);
      const viewport = viewportSize(this.domDocument);
      const viewportWidth = viewport.width;
      const viewportHeight = viewport.height;
      const insets = this.updateSideControlInsets();
      const position = mode === "scene" && sceneWidth > 0 && sceneHeight > 0
        ? {
          ...(insets.left > 0 ? { left: insets.left } : {}),
          ...(insets.top > 0 ? { top: insets.top } : {}),
          width: Math.min(sceneWidth, Math.max(1, viewportWidth - insets.left - insets.right)),
          height: Math.min(sceneHeight, Math.max(1, viewportHeight - insets.top - insets.bottom))
        }
        : mode === "replace"
          ? { left: 0, top: 0, width: viewportWidth, height: viewportHeight }
          : { width: 800, height: 600 };
      if (this.element) this.setPosition?.(position);
      if (this.element?.dataset) this.element.dataset.displayMode = mode;
      this.updateViewport();
    }

    setPanelGridStyles() {
      if (!this.panelGridElement) return;
      const areas = defaultPanelAreas(this.viewerState.panelCount);
      const columns = this.viewerState.responsive?.columns ?? 2;
      const [columnSplit, rowSplit] = this.viewerState.splits;
      this.panelGridElement.style.setProperty?.(
        "--tactical-column-split", `${columnSplit * 100}%`
      );
      this.panelGridElement.style.setProperty?.(
        "--tactical-row-split", `${rowSplit * 100}%`
      );
      this.panelGridElement.style.gridTemplateColumns = this.viewerState.panelCount === 1 || columns === 1
        ? "minmax(0, 1fr)"
        : "minmax(0, var(--tactical-column-split)) minmax(0, 1fr)";
      this.panelGridElement.style.gridTemplateRows = columns === 1 && this.viewerState.panelCount > 1
        ? `repeat(${this.viewerState.panelCount}, minmax(0, 1fr))`
        : this.viewerState.panelCount >= 3
        ? "minmax(0, var(--tactical-row-split)) minmax(0, 1fr)"
        : "minmax(0, 1fr)";
      this.panelElements.forEach((panel, index) => {
        const area = areas[index];
        if (!area) return;
        panel.style.gridColumn = columns === 1 ? "1" : `${area.column} / span ${area.columnSpan}`;
        panel.style.gridRow = columns === 1 ? `${index + 1}` : `${area.row} / span ${area.rowSpan}`;
        panel.style.minWidth = "0";
      });
      const splitters = [
        this.panelGridElement.querySelector?.('[data-role="splitter-columns"]'),
        this.panelGridElement.querySelector?.('[data-role="splitter-rows"]')
      ].filter(Boolean);
      for (const splitter of splitters) {
        splitter.hidden = splitter.dataset.axis === "columns"
          ? this.viewerState.panelCount < 2 || columns < 2
          : this.viewerState.panelCount < 3 || columns < 2;
        splitter.setAttribute?.("aria-valuenow", String(
          splitter.dataset.axis === "columns" ? columnSplit : rowSplit
        ));
      }
      const rowSplitter = this.panelGridElement.querySelector?.('[data-role="splitter-rows"]');
      if (rowSplitter) rowSplitter.style.left = this.viewerState.panelCount === 3 && columns > 1
        ? `${columnSplit * 100}%`
        : "0";
    }

    setSplitter(axis, value) {
      const splitIndex = axis === "rows" ? 1 : axis === "columns" ? 0 : -1;
      if (splitIndex < 0) return false;
      const rect = this.panelGridElement?.getBoundingClientRect?.() ?? {};
      const total = axis === "rows" ? Number(rect.height) : Number(rect.width);
      const minimum = axis === "rows" ? MIN_PANEL_HEIGHT : MIN_PANEL_WIDTH;
      const proportion = clampSplitterProportion(value, total, minimum);
      this.viewerState.splits[splitIndex] = proportion;
      this.setPanelGridStyles();
      this.persistLayout();
      this.requestRender({ type: "splitter-change", axis, proportion });
      return proportion;
    }

    updatePanelControls(index) {
      const panelElement = this.panelElements[index];
      const panel = this.viewerState.panels[index];
      if (!panelElement || !panel) return;
      const select = panelElement.querySelector?.('[data-role="view-select"]');
      if (select) select.value = panel.view;
      const gridStyle = panelElement.querySelector?.('[data-role="grid-style"]');
      if (gridStyle) gridStyle.value = panel.overlays.gridStyle ?? DEFAULT_GRID_STYLE;
      const canvas = this.canvases[index];
      const readOnly = isometricView(panel.view);
      if (canvas) {
        canvas.style.cursor = readOnly ? "grab" : "default";
        canvas.setAttribute?.(
          "aria-description",
          readOnly
          ? localize("viewer.interaction.isoDescription", "Isometric view is read-only for token movement; dragging pans the view.")
            : localize("viewer.interaction.orthographicDescription", "Left click selects; left-drag selects a box; right-drag pans the view. Dragging a token moves it.")
        );
        canvas.title = readOnly
          ? localize("viewer.interaction.isoTitle", "Left click selects; left-drag selects a box; right-drag pans the view.")
          : localize("viewer.interaction.orthographicTitle", "Left click selects; left-drag selects a box; right-drag pans the view. Dragging a token moves it.");
      }
      for (const key of Object.keys(DEFAULT_OVERLAYS).filter((key) => !["gridOpacity", "gridStyle"].includes(key))) {
        const checkbox = panelElement.querySelector?.(`[data-role="overlay-${key}"]`);
        if (checkbox) checkbox.checked = panel.overlays[key] === true;
      }
    }

    beginSplitterDrag(axis, splitter, event) {
      const pointerId = event?.pointerId;
      const move = (moveEvent) => {
        if (pointerId !== undefined && moveEvent?.pointerId !== pointerId) return;
        const rect = this.panelGridElement?.getBoundingClientRect?.() ?? {};
        const offset = axis === "rows"
          ? Number(moveEvent?.clientY) - Number(rect.top || 0)
          : Number(moveEvent?.clientX) - Number(rect.left || 0);
        const total = axis === "rows" ? Number(rect.height) : Number(rect.width);
        if (Number.isFinite(offset) && total > 0) this.setSplitter(axis, offset / total);
        moveEvent?.preventDefault?.();
      };
      const end = (endEvent) => {
        if (pointerId !== undefined && endEvent?.pointerId !== pointerId) return;
        splitter.removeEventListener?.("pointermove", move);
        splitter.removeEventListener?.("pointerup", end);
        splitter.removeEventListener?.("pointercancel", end);
      };
      splitter.addEventListener?.("pointermove", move);
      splitter.addEventListener?.("pointerup", end);
      splitter.addEventListener?.("pointercancel", end);
      splitter.setPointerCapture?.(pointerId);
      event?.preventDefault?.();
    }

    updateInteractionControls(visibleTacticalStates = this.getVisibleTacticalStates()) {
      this.panelElements.forEach((panelElement, index) => {
        const panel = this.viewerState.panels[index];
        if (!panel || !panelElement) return;
        const selected = visibleTacticalStates.find((state) =>
          state?.tokenId === this.getSelectedTokenId(index)
        );
        const movementDisabled = isometricView(panel.view)
          || selected?.visibleToCurrentUser !== true
          || selected?.canCurrentUserMove !== true;
        for (const role of ["move-left", "move-right", "move-up", "move-down"]) {
          const control = panelElement.querySelector?.(`[data-role="${role}"]`);
          if (control) control.disabled = movementDisabled;
        }
        for (const role of ["z-decrease", "z-increase"]) {
          const control = panelElement.querySelector?.(`[data-role="${role}"]`);
          if (control) control.disabled = movementDisabled;
        }
        for (const role of ["heading-decrease", "heading-increase"]) {
          const control = panelElement.querySelector?.(`[data-role="${role}"]`);
          if (control) control.disabled = selected?.visibleToCurrentUser !== true
            || selected?.canCurrentUserRotate !== true;
        }
        const pitchDisabled = isometricView(panel.view)
          || selected?.visibleToCurrentUser !== true
          || selected?.canCurrentUserRotate !== true;
        for (const role of ["pitch-previous", "pitch-next"]) {
          const control = panelElement.querySelector?.(`[data-role="${role}"]`);
          if (control) control.disabled = pitchDisabled;
        }
        const deleteControl = panelElement.querySelector?.('[data-role="delete-token"]');
        if (deleteControl) {
          const canDelete = selected?.canCurrentUserDelete
            ?? selected?.canCurrentUserUpdate === true;
          deleteControl.disabled = selected?.visibleToCurrentUser !== true || !canDelete;
        }
        const sizeDisabled = selected?.visibleToCurrentUser !== true
          || selected?.canCurrentUserUpdate !== true;
        for (const [role, value] of [["token-width", selected?.width], ["token-height", selected?.height]]) {
          const control = panelElement.querySelector?.(`[data-role="${role}"]`);
          if (!control) continue;
          control.disabled = sizeDisabled;
          if (Number.isFinite(value) && value > 0) control.value = String(value);
        }
      });
    }

    handleMovementPreview(preview) {
      this.viewerState.movementPreview = preview;
      this.requestRender({ type: preview ? "movement-preview" : "movement-preview-cleared" });
    }

    handleActionResult(result) {
      this.viewerState.movementPreview = null;
      if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
      this.refreshFromDocuments({ render: false });
      this.requestRender({ type: "tactical-action-result", status: result?.status });
    }

    enqueuePanelAction(panelIndex, action) {
      const queue = this.panelActionQueues[panelIndex] ?? {
        busy: false,
        tail: Promise.resolve()
      };
      this.panelActionQueues[panelIndex] = queue;
      if (!queue.busy) {
        queue.busy = true;
        let result;
        try {
          result = action();
        } catch (error) {
          result = Promise.reject(error);
        }
        const current = Promise.resolve(result);
        queue.tail = current;
        current.then(
          () => { if (queue.tail === current) queue.busy = false; },
          () => { if (queue.tail === current) queue.busy = false; }
        );
        return current;
      }
      const queued = queue.tail.then(action, action);
      queue.tail = queued;
      queued.then(
        () => { if (queue.tail === queued) queue.busy = false; },
        () => { if (queue.tail === queued) queue.busy = false; }
      );
      return queued;
    }

    setHeadingBy(delta, panelIndex = 0) {
      const controller = this.inputControllers[panelIndex];
      if (controller) {
        return controller.enqueueAction(() => this.commitHeadingBy(delta, panelIndex));
      }
      return this.enqueuePanelAction(panelIndex,
        () => this.commitHeadingBy(delta, panelIndex));
    }

    async commitHeadingBy(delta, panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!selected || selected.visibleToCurrentUser !== true
        || selected.canCurrentUserRotate !== true
        || !document || typeof this.tacticalUpdateService?.setHeading !== "function") {
        return null;
      }
      const snapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
      const orientationAdapter = this.tacticalUpdateService.orientationAdapter;
      const documentHeading = Number.isFinite(Number(document.rotation))
        && typeof orientationAdapter?.foundryRotationToHeading === "function"
        ? orientationAdapter.foundryRotationToHeading(Number(document.rotation))
        : selected.heading;
      const result = await this.tacticalUpdateService.setHeading(
        document,
        snapHeading(documentHeading) + delta,
        snapshot
      );
      this.handleActionResult(result);
      return result;
    }

    async setPitchTo(pitch, panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!selected || selected.visibleToCurrentUser !== true
        || selected.canCurrentUserRotate !== true
        || !document || typeof this.tacticalUpdateService?.setPitch !== "function") {
        return null;
      }
      const snapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
      const result = await this.tacticalUpdateService.setPitch(document, pitch, snapshot);
      this.handleActionResult(result);
      return result;
    }

    setPitchBy(delta, panelIndex = 0) {
      const controller = this.inputControllers[panelIndex];
      if (controller) {
        return controller.enqueueAction(() => this.commitPitchBy(delta, panelIndex));
      }
      return this.enqueuePanelAction(panelIndex,
        () => this.commitPitchBy(delta, panelIndex));
    }

    async commitPitchBy(delta, panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      const documentPitch = document ? getTokenPitch(document) : selected?.pitch;
      const currentIndex = ALLOWED_PITCHES.indexOf(documentPitch);
      if (currentIndex < 0) return null;
      const nextIndex = (currentIndex + delta % ALLOWED_PITCHES.length
        + ALLOWED_PITCHES.length) % ALLOWED_PITCHES.length;
      return this.setPitchTo(ALLOWED_PITCHES[nextIndex], panelIndex);
    }

    async setSelectedTokenSize(width, height, panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!selected || selected.visibleToCurrentUser !== true
        || selected.canCurrentUserUpdate !== true
        || !document || typeof this.tacticalUpdateService?.setSize !== "function") {
        return null;
      }
      const snapshot = typeof this.tacticalUpdateService.captureSizeSnapshot === "function"
        ? this.tacticalUpdateService.captureSizeSnapshot(document)
        : { width: document.width, height: document.height };
      const result = await this.tacticalUpdateService.setSize(document, width, height, snapshot);
      this.handleActionResult(result);
      return result;
    }

    async setSelectedTokenDimension(dimension, value, panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!["width", "height"].includes(dimension)
        || !selected || selected.visibleToCurrentUser !== true
        || selected.canCurrentUserUpdate !== true
        || !document) return null;
      const snapshot = typeof this.tacticalUpdateService.captureSizeSnapshot === "function"
        ? this.tacticalUpdateService.captureSizeSnapshot(document)
        : { width: document.width, height: document.height };
      if (typeof this.tacticalUpdateService.setDimension !== "function") {
        return this.setSelectedTokenSize(
          dimension === "width" ? value : this.panelElements[panelIndex]
            ?.querySelector?.('[data-role="token-width"]')?.value ?? selected.width,
          dimension === "height" ? value : this.panelElements[panelIndex]
            ?.querySelector?.('[data-role="token-height"]')?.value ?? selected.height,
          panelIndex
        );
      }
      const result = await this.tacticalUpdateService.setDimension(document, dimension, value, snapshot);
      this.handleActionResult(result);
      return result;
    }

    async deleteSelectedToken(panelIndex = 0) {
      const selected = this.getSelectedTacticalState(panelIndex);
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      const canDelete = selected?.canCurrentUserDelete
        ?? selected?.canCurrentUserUpdate === true;
      if (!selected || selected.visibleToCurrentUser !== true || !canDelete
        || !document || typeof this.tacticalUpdateService?.deleteToken !== "function") {
        return null;
      }

      const result = await this.tacticalUpdateService.deleteToken(document);
      this.handleActionResult(result);
      if (result?.status === "accepted") this.handleSelectionChanged(null, panelIndex);
      return result;
    }

    createInputController() {
      return this.createPanelInputController(0);
    }

    createPanelInputController(index) {
      const canvas = this.canvases[index];
      if (!canvas || this.inputControllers[index]) return this.inputControllers[index];
      this.inputControllers[index] = new PanelInputController({
        element: canvas,
        keyboardTarget: this.panelElements[index]?.querySelector?.('[data-role="panel-surface"]'),
        panel: this.viewerState.panels[index],
        projectionEngine: this.projectionEngine,
        getRenderModel: () => this.buildRenderModel(undefined, index),
        scene: this.scene,
        coordinateAdapter: this.coordinateAdapter,
        tacticalUpdateService: this.tacticalUpdateService,
        getTokenById: (tokenId) => this.getTokenById(tokenId),
        onSelectionChanged: (tokenId) => this.handleSelectionChanged(tokenId, index),
        onSelectionBoxChanged: (selectionBox) => this.handleSelectionBoxChanged(selectionBox, index),
        onOverlapChooser: (candidates) => this.showOverlapChooser(index, candidates),
        onViewChanged: (change) => this.handlePanelViewChanged(index, change),
        onMovementPreview: (preview) => this.handleMovementPreview(preview),
        onActionResult: (result) => this.handleActionResult(result),
        onDeleteToken: () => this.deleteSelectedToken(index),
        getSelectedTokenState: () => this.getSelectedTacticalState(index),
        // The controller already serializes shortcut actions. Call the
        // commit methods here so the public wrappers do not enqueue again.
        onHeadingDelta: (delta) => this.commitHeadingBy(delta, index),
        onPitchDelta: (delta) => this.commitPitchBy(delta, index),
        requestRender: (invalidation) => this.requestRender(invalidation)
      });
      return this.inputControllers[index];
    }

    async _renderHTML() {
      if (!this.domDocument?.createElement) {
        throw new Error("TacticalViewerApplication requires a browser document to render");
      }
      this.inputControllers.forEach((controller) => controller?.detach?.());
      this.inputControllers = [];

      const root = this.domDocument.createElement("div");
      addClass(root, "tactical-viewer-shell");
      this.viewerState.reducedMotion = this.reducedMotionOverride ?? reducedMotionPreference();
      if (this.viewerState.reducedMotion) addClass(root, "tactical-viewer-reduced-motion");
      root.dataset.reducedMotion = String(this.viewerState.reducedMotion);
      root.dataset.displayMode = this.viewerState.displayMode;
      root.addEventListener?.("dragover", this.handleDragOver);
      root.addEventListener?.("drop", this.handleViewerDrop);

      const toolbar = this.domDocument.createElement("div");
      addClass(toolbar, "tactical-viewer-shared-toolbar");
      setRole(toolbar, "shared-toolbar");
      const panelCountLabel = this.domDocument.createElement("label");
      panelCountLabel.textContent = localize("viewer.panels", "Panels");
      panelCountLabel.htmlFor = `${MODULE_ID}-panel-count`;
      const panelCountSelect = this.domDocument.createElement("select");
      panelCountSelect.id = `${MODULE_ID}-panel-count`;
      panelCountSelect.setAttribute?.("aria-label", localize("viewer.panelCount", "Panel count"));
      setRole(panelCountSelect, "panel-count");
      for (const count of PANEL_COUNTS) {
        const option = this.domDocument.createElement("option");
        option.value = String(count);
        option.textContent = String(count);
        panelCountSelect.appendChild(option);
      }
      panelCountSelect.value = String(this.viewerState.panelCount);
      panelCountSelect.addEventListener?.("change", () => this.setPanelCount(panelCountSelect.value));

      const displayModeLabel = this.domDocument.createElement("label");
      displayModeLabel.textContent = localize("viewer.displayMode.label", "Display mode");
      const displayModeSelect = this.domDocument.createElement("select");
      setRole(displayModeSelect, "display-mode");
      displayModeSelect.setAttribute?.("aria-label", localize("viewer.displayMode.label", "Display mode"));
      for (const mode of DISPLAY_MODES) {
        const option = this.domDocument.createElement("option");
        option.value = mode;
        option.textContent = localize(`viewer.displayMode.${mode}`, mode);
        displayModeSelect.appendChild(option);
      }
      displayModeSelect.value = this.viewerState.displayMode;
      displayModeSelect.addEventListener?.("change", () => this.setDisplayMode(displayModeSelect.value));
      displayModeLabel.appendChild(displayModeSelect);
      toolbar.appendChild(displayModeLabel);

      addClass(panelCountSelect, "tactical-viewer-panel-count");
      toolbar.append(panelCountLabel, panelCountSelect);

      const sharedOptionsButton = makeButton(
        this.domDocument,
        localize("viewer.options", "Options"),
        "shared-options-button",
        localize("viewer.options", "Options")
      );
      const sharedOptions = this.domDocument.createElement("div");
      addClass(sharedOptions, "tactical-viewer-shared-options");
      setRole(sharedOptions, "shared-options");
      sharedOptions.hidden = true;
      sharedOptionsButton.addEventListener?.("click", () => {
        sharedOptions.hidden = !sharedOptions.hidden;
      });
      toolbar.appendChild(sharedOptionsButton);

      const sceneGrid = this.sceneGridDimensions();
      for (const [role, labelText, value] of [
        ["grid-x", localize("viewer.grid.x", "X"), this.viewerState.gridDimensions?.x ?? this.viewerState.gridDimensions?.columns ?? sceneGrid?.x],
        ["grid-y", localize("viewer.grid.y", "Y"), this.viewerState.gridDimensions?.y ?? this.viewerState.gridDimensions?.rows ?? sceneGrid?.y],
        ["grid-z", localize("viewer.grid.z", "Z"), this.viewerState.gridDimensions?.z ?? sceneGrid?.z ?? 10]
      ]) {
        const label = this.domDocument.createElement("label");
        label.textContent = labelText;
        const input = this.domDocument.createElement("input");
        input.type = "number";
        input.min = "1";
        input.max = "200";
        input.step = "1";
        input.value = Number.isFinite(value) ? String(value) : "1";
        setRole(input, role);
        input.setAttribute?.("aria-label", labelText);
        input.addEventListener?.("change", () => {
          const x = this.shellElement?.querySelector?.('[data-role="grid-x"]')?.value;
          const y = this.shellElement?.querySelector?.('[data-role="grid-y"]')?.value;
          const z = this.shellElement?.querySelector?.('[data-role="grid-z"]')?.value;
          void this.setGridDimensions(x, y, z);
        });
        label.appendChild(input);
        sharedOptions.appendChild(label);
      }

      for (const [key, labelText] of [
        ["selection", localize("viewer.links.selection", "Link Selection")],
        ["center", localize("viewer.links.center", "Link Center")],
        ["zoom", localize("viewer.links.zoom", "Link Zoom")]
      ]) {
        const label = this.domDocument.createElement("label");
        const checkbox = this.domDocument.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.viewerState.links[key] === true;
        checkbox.setAttribute?.("aria-label", labelText);
        setRole(checkbox, `link-${key}`);
        checkbox.addEventListener?.("change", () => this.setLink(key, checkbox.checked));
        const labelTextElement = this.domDocument.createElement("span");
        labelTextElement.textContent = labelText;
        label.append(checkbox, labelTextElement);
        sharedOptions.appendChild(label);
        this.linkControls[key] = checkbox;
      }

      const backgroundColorLabel = this.domDocument.createElement("label");
      backgroundColorLabel.textContent = localize("viewer.background.color", "Background color");
      const backgroundColor = this.domDocument.createElement("input");
      backgroundColor.type = "color";
      backgroundColor.value = this.viewerState.background.color;
      setRole(backgroundColor, "background-color");
      backgroundColor.addEventListener?.("change", () => this.setBackground({
        color: backgroundColor.value,
        image: this.viewerState.background.image
      }));
      backgroundColorLabel.appendChild(backgroundColor);
      sharedOptions.appendChild(backgroundColorLabel);

      const backgroundImageLabel = this.domDocument.createElement("label");
      backgroundImageLabel.textContent = localize("viewer.background.image", "Background image");
      const backgroundImage = this.domDocument.createElement("input");
      backgroundImage.type = "text";
      backgroundImage.value = this.viewerState.background.image;
      backgroundImage.placeholder = localize("viewer.background.imagePlaceholder", "Image path or URL");
      setRole(backgroundImage, "background-image");
      backgroundImage.addEventListener?.("change", () => this.setBackground({
        color: this.viewerState.background.color,
        image: backgroundImage.value
      }));
      const chooseImage = makeButton(
        this.domDocument,
        localize("viewer.background.choose", "Choose"),
        "background-image-choose",
        localize("viewer.background.choose", "Choose background image")
      );
      chooseImage.addEventListener?.("click", () => {
        const Picker = globalThis?.foundry?.applications?.apps?.FilePicker ?? globalThis?.FilePicker;
        if (typeof Picker !== "function") return;
        const picker = new Picker({
          type: "image",
          current: backgroundImage.value,
          callback: (path) => this.setBackground({
            color: this.viewerState.background.color,
            image: path
          })
        });
        picker.render?.(true);
      });
      backgroundImageLabel.append(backgroundImage, chooseImage);
      sharedOptions.appendChild(backgroundImageLabel);
      toolbar.appendChild(sharedOptions);
      this.sharedOptionsElement = sharedOptions;
      this.backgroundControls = { color: backgroundColor, image: backgroundImage };

      const panelGrid = this.domDocument.createElement("div");
      addClass(panelGrid, "tactical-viewer-panel-grid");
      setRole(panelGrid, "panel-grid");

      this.panelElements = [];
      this.canvases = [];
      for (let index = 0; index < this.viewerState.panelCount; index += 1) {
        const panel = this.domDocument.createElement("section");
        addClass(panel, "tactical-viewer-panel");
        setRole(panel, "panel");
        panel.dataset.panelIndex = String(index);

        const panelToolbar = this.domDocument.createElement("div");
        addClass(panelToolbar, "tactical-viewer-panel-toolbar");
        setRole(panelToolbar, "panel-toolbar");
        const viewSelect = this.domDocument.createElement("select");
        viewSelect.setAttribute?.("aria-label", localizeFormat(
          "viewer.projection",
          `Panel ${index + 1} projection`,
          { panel: index + 1 }
        ));
        setRole(viewSelect, "view-select");
        for (const view of this.viewRegistry.list().filter(({ id }) => isRenderableView(id))) {
          const option = this.domDocument.createElement("option");
          option.value = view.id;
          option.textContent = viewLabel(view.id, view.name);
          viewSelect.appendChild(option);
        }
        viewSelect.value = this.viewerState.panels[index].view;
        viewSelect.addEventListener?.("change", () => this.setPanelView(index, viewSelect.value));

        const zoomOut = makeButton(this.domDocument, "−", "zoom-out", localize("viewer.zoomOut", "Zoom out"));
        const zoomLabel = this.domDocument.createElement("span");
        zoomLabel.textContent = localizeFormat("viewer.zoomLabel", `${this.viewerState.panels[index].zoom} px/cell`, {
          zoom: this.viewerState.panels[index].zoom
        });
        setRole(zoomLabel, "zoom-label");
        const zoomIn = makeButton(this.domDocument, "+", "zoom-in", localize("viewer.zoomIn", "Zoom in"));
        const resetView = makeButton(this.domDocument, "Reset", "reset-view", localize("viewer.resetView", "Reset view"));
        const centerView = makeButton(this.domDocument, "Center", "center-view", localize("viewer.centerView", "Center grid in view"));
        const moveLeft = makeButton(this.domDocument, "←", "move-left", localize("viewer.movement.left", "Move one cell left"));
        const moveRight = makeButton(this.domDocument, "→", "move-right", localize("viewer.movement.right", "Move one cell right"));
        const moveUp = makeButton(this.domDocument, "↑", "move-up", localize("viewer.movement.up", "Move one cell up"));
        const moveDown = makeButton(this.domDocument, "↓", "move-down", localize("viewer.movement.down", "Move one cell down"));
        const zDecrease = makeButton(this.domDocument, "Z−", "z-decrease", localize("viewer.movement.zDown", "Move down one tactical Z level"));
        const zIncrease = makeButton(this.domDocument, "Z+", "z-increase", localize("viewer.movement.zUp", "Move up one tactical Z level"));
        const headingDecrease = makeButton(this.domDocument, "−45°", "heading-decrease", localize("viewer.heading.decrease", "Rotate heading left 45 degrees"));
        const headingIncrease = makeButton(this.domDocument, "+45°", "heading-increase", localize("viewer.heading.increase", "Rotate heading right 45 degrees"));
        const pitchPrevious = makeButton(this.domDocument, "Pitch −", "pitch-previous", localize("viewer.pitch.previous", "Previous pitch"));
        const pitchNext = makeButton(this.domDocument, "Pitch +", "pitch-next", localize("viewer.pitch.next", "Next pitch"));
        const deleteToken = makeButton(this.domDocument, "Delete", "delete-token", localize("viewer.deleteToken", "Delete selected token"));
        const optionsButton = makeButton(this.domDocument, localize("viewer.options", "Options"), "panel-options", localize("viewer.panelOptions", "Panel options"));
        const options = this.domDocument.createElement("div");
        addClass(options, "tactical-viewer-overlay-options");
        options.hidden = true;
        optionsButton.addEventListener?.("click", () => {
          options.hidden = !options.hidden;
        });
        for (const key of Object.keys(DEFAULT_OVERLAYS).filter((key) => !["gridOpacity", "gridStyle"].includes(key))) {
          const label = this.domDocument.createElement("label");
          const checkbox = this.domDocument.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = this.viewerState.panels[index].overlays[key] === true;
          setRole(checkbox, `overlay-${key}`);
          checkbox.setAttribute?.("aria-label", `${localize("viewer.overlay." + key, key)} (${index + 1})`);
          checkbox.addEventListener?.("change", () => this.setPanelOverlay(index, key, checkbox.checked));
          const labelTextElement = this.domDocument.createElement("span");
          labelTextElement.textContent = localize("viewer.overlay." + key, key);
          label.append(checkbox, labelTextElement);
          options.appendChild(label);
        }
        const opacityLabel = this.domDocument.createElement("label");
        opacityLabel.textContent = localize("viewer.gridOpacity", "Grid opacity");
        const opacity = this.domDocument.createElement("input");
        opacity.type = "range";
        opacity.min = "0";
        opacity.max = "100";
        opacity.step = "1";
        opacity.value = String(Math.round(
          (this.viewerState.panels[index].overlays.gridOpacity ?? DEFAULT_GRID_OPACITY) * 100
        ));
        setRole(opacity, "grid-opacity");
        opacity.setAttribute?.("aria-label", `${localize("viewer.gridOpacity", "Grid opacity")} (${index + 1})`);
        const opacityValue = this.domDocument.createElement("output");
        setRole(opacityValue, "grid-opacity-value");
        opacityValue.textContent = `${opacity.value}%`;
        opacity.addEventListener?.("input", () => {
          opacityValue.textContent = `${opacity.value}%`;
          void this.setPanelGridOpacity(index, Number(opacity.value) / 100, { persist: false });
        });
        opacity.addEventListener?.("change", () => {
          void this.setPanelGridOpacity(index, Number(opacity.value) / 100);
        });
        opacityLabel.append(opacity, opacityValue);
        options.appendChild(opacityLabel);
        const gridStyleLabel = this.domDocument.createElement("label");
        gridStyleLabel.textContent = localize("viewer.gridStyle", "Grid lines");
        const gridStyle = this.domDocument.createElement("select");
        setRole(gridStyle, "grid-style");
        gridStyle.setAttribute?.("aria-label", `${localize("viewer.gridStyle", "Grid lines")} (${index + 1})`);
        for (const style of GRID_LINE_STYLES) {
          const option = this.domDocument.createElement("option");
          option.value = style;
          option.textContent = localize(`viewer.gridStyle.${style}`, style);
          gridStyle.appendChild(option);
        }
        gridStyle.value = this.viewerState.panels[index].overlays.gridStyle ?? DEFAULT_GRID_STYLE;
        gridStyle.addEventListener?.("change", () => {
          void this.setPanelGridStyle(index, gridStyle.value);
        });
        gridStyleLabel.appendChild(gridStyle);
        options.appendChild(gridStyleLabel);
        const tokenSizeLabel = this.domDocument.createElement("span");
        tokenSizeLabel.textContent = localize("viewer.tokenSize", "Selected token size");
        addClass(tokenSizeLabel, "tactical-viewer-token-size-label");
        options.appendChild(tokenSizeLabel);
        for (const [role, labelText] of [
          ["token-width", localize("viewer.tokenWidth", "Width")],
          ["token-height", localize("viewer.tokenHeight", "Height")]
        ]) {
          const sizeLabel = this.domDocument.createElement("label");
          sizeLabel.textContent = labelText;
          const sizeInput = this.domDocument.createElement("input");
          sizeInput.type = "number";
          sizeInput.min = "1";
          sizeInput.max = "20";
          sizeInput.step = "1";
          sizeInput.value = "1";
          setRole(sizeInput, role);
          sizeInput.setAttribute?.("aria-label", `${labelText} (${index + 1})`);
          sizeInput.addEventListener?.("change", () => {
            void this.setSelectedTokenDimension(
              role === "token-width" ? "width" : "height",
              sizeInput.value,
              index
            );
          });
          sizeLabel.appendChild(sizeInput);
          options.appendChild(sizeLabel);
        }
        const panelName = this.domDocument.createElement("span");
        addClass(panelName, "tactical-viewer-panel-name");
        setRole(panelName, "panel-name");
        panelName.textContent = `Panel ${index + 1}`;

        const directionControls = this.domDocument.createElement("div");
        addClass(directionControls, "tactical-viewer-direction-controls");
        setRole(directionControls, "direction-controls");
        addClass(moveUp, "direction-up");
        addClass(moveDown, "direction-down");
        addClass(moveLeft, "direction-left");
        addClass(moveRight, "direction-right");
        addClass(zDecrease, "direction-z-decrease");
        addClass(zIncrease, "direction-z-increase");
        addClass(headingDecrease, "direction-rotation-decrease");
        addClass(headingIncrease, "direction-rotation-increase");
        addClass(pitchPrevious, "direction-pitch-decrease");
        addClass(pitchNext, "direction-pitch-increase");
        addClass(deleteToken, "direction-delete");
        directionControls.append(
          moveUp, moveLeft, moveRight, moveDown,
          zDecrease, zIncrease, pitchPrevious, pitchNext,
          headingDecrease, headingIncrease, deleteToken
        );
        panelToolbar.append(
          panelName, viewSelect, zoomOut, zoomLabel, zoomIn, resetView, centerView,
          optionsButton, options
        );

        const panelSurface = this.domDocument.createElement("div");
        addClass(panelSurface, "tactical-viewer-panel-surface");
        setRole(panelSurface, "panel-surface");
        const canvas = this.domDocument.createElement("canvas");
        addClass(canvas, "tactical-viewer-canvas");
        setRole(canvas, "canvas");
        canvas.setAttribute?.("aria-label", localizeFormat(
          "viewer.canvas",
          `Panel ${index + 1} tactical projection canvas`,
          { panel: index + 1 }
        ));
        canvas.setAttribute?.("tabindex", "0");
        canvas.tabIndex = 0;
        canvas.setAttribute?.("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Delete Backspace [ ] , .");
        panelSurface.append(canvas, directionControls);
        panel.append(panelToolbar, panelSurface);
        panelGrid.appendChild(panel);
        this.panelElements.push(panel);
        this.canvases.push(canvas);
        const controller = this.createPanelInputController(index);
        this.updatePanelControls(index);
        zoomOut.addEventListener?.("click", () => controller?.zoomOut());
        zoomIn.addEventListener?.("click", () => controller?.zoomIn());
        resetView.addEventListener?.("click", () => controller?.resetView());
        centerView.addEventListener?.("click", () => controller?.centerView());
        const moveFromButton = (key) => controller?.enqueueAction(() =>
          this.enqueuePanelAction(index, () =>
            controller.moveByKeyboard(controller.keyboardDelta(key))));
        moveLeft.addEventListener?.("click", () => void moveFromButton("ArrowLeft"));
        moveRight.addEventListener?.("click", () => void moveFromButton("ArrowRight"));
        moveUp.addEventListener?.("click", () => void moveFromButton("ArrowUp"));
        moveDown.addEventListener?.("click", () => void moveFromButton("ArrowDown"));
        directionControls.addEventListener?.("keydown", (event) => {
          if (event?.target?.tagName?.toUpperCase?.() !== "BUTTON") return;
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Delete", "Backspace"].includes(event.key)) return;
          void controller?.handleKeyDown(event);
        });
        zDecrease.addEventListener?.("click", () => void moveFromButton("PageDown"));
        zIncrease.addEventListener?.("click", () => void moveFromButton("PageUp"));
        const queueControllerAction = (action) => void controller?.enqueueAction(action);
        headingDecrease.addEventListener?.("click", () => queueControllerAction(
          () => this.commitHeadingBy(-45, index)
        ));
        headingIncrease.addEventListener?.("click", () => queueControllerAction(
          () => this.commitHeadingBy(45, index)
        ));
        pitchPrevious.addEventListener?.("click", () => queueControllerAction(
          () => this.commitPitchBy(-1, index)
        ));
        pitchNext.addEventListener?.("click", () => queueControllerAction(
          () => this.commitPitchBy(1, index)
        ));
        deleteToken.addEventListener?.("click", () => void this.deleteSelectedToken(index));
      }

      const columnSplitter = this.domDocument.createElement("div");
      setRole(columnSplitter, "splitter-columns");
      columnSplitter.dataset.axis = "columns";
      columnSplitter.setAttribute?.("role", "separator");
      columnSplitter.setAttribute?.("aria-label", localize("viewer.splitter.columns", "Resize panel columns"));
      columnSplitter.setAttribute?.("aria-orientation", "vertical");
      columnSplitter.setAttribute?.("tabindex", "0");
      columnSplitter.tabIndex = 0;
      columnSplitter.addEventListener?.("pointerdown", (event) => this.beginSplitterDrag("columns", columnSplitter, event));
      panelGrid.appendChild(columnSplitter);
      const rowSplitter = this.domDocument.createElement("div");
      setRole(rowSplitter, "splitter-rows");
      rowSplitter.dataset.axis = "rows";
      rowSplitter.setAttribute?.("role", "separator");
      rowSplitter.setAttribute?.("aria-label", localize("viewer.splitter.rows", "Resize panel rows"));
      rowSplitter.setAttribute?.("aria-orientation", "horizontal");
      rowSplitter.setAttribute?.("tabindex", "0");
      rowSplitter.tabIndex = 0;
      rowSplitter.addEventListener?.("pointerdown", (event) => this.beginSplitterDrag("rows", rowSplitter, event));
      panelGrid.appendChild(rowSplitter);

      const selectedTokenReadout = this.domDocument.createElement("div");
      addClass(selectedTokenReadout, "tactical-viewer-selected-token-readout");
      selectedTokenReadout.setAttribute?.("aria-live", "polite");
      selectedTokenReadout.setAttribute?.("aria-atomic", "true");
      setRole(selectedTokenReadout, "selected-token-readout");
      selectedTokenReadout.setAttribute?.("role", "status");
      selectedTokenReadout.textContent = localize("viewer.readout.none", "No tactical token selected");
      const actionMessage = this.domDocument.createElement("div");
      addClass(actionMessage, "tactical-viewer-action-message");
      actionMessage.setAttribute?.("aria-live", "polite");
      setRole(actionMessage, "action-message");
      const responsiveWarning = this.domDocument.createElement("div");
      addClass(responsiveWarning, "tactical-viewer-responsive-warning");
      responsiveWarning.setAttribute?.("role", "status");
      responsiveWarning.setAttribute?.("aria-live", "polite");
      setRole(responsiveWarning, "responsive-warning");
      responsiveWarning.hidden = true;
      root.append(toolbar, panelGrid);
      const overlapChooser = this.domDocument.createElement("div");
      addClass(overlapChooser, "tactical-viewer-overlap-chooser");
      setRole(overlapChooser, "overlap-chooser");
      overlapChooser.hidden = true;
      const overlapLabel = this.domDocument.createElement("label");
      overlapLabel.textContent = localize("viewer.overlapChooser", "Choose visible overlapping token");
      const overlapSelect = this.domDocument.createElement("select");
      setRole(overlapSelect, "overlap-chooser-select");
      overlapSelect.setAttribute?.("aria-label", localize("viewer.overlapChooser", "Choose visible overlapping token"));
      overlapSelect.tabIndex = 0;
      overlapSelect.addEventListener?.("change", () => {
        const selected = this.overlapChooserCandidates.find((candidate) =>
          String(candidate.tokenId) === String(overlapSelect.value)
        );
        if (!selected) return;
        const selectedPanelIndex = this.overlapChooserPanelIndex;
        this.hideOverlapChooser();
        this.handleSelectionChanged(selected.tokenId, selectedPanelIndex);
      });
      overlapSelect.addEventListener?.("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault?.();
        this.hideOverlapChooser();
      });
      overlapLabel.appendChild(overlapSelect);
      overlapChooser.appendChild(overlapLabel);
      root.appendChild(overlapChooser);
      root.appendChild(selectedTokenReadout);
      root.appendChild(actionMessage);
      root.appendChild(responsiveWarning);

      this.panelGridElement = panelGrid;
      this.shellElement = root;
      this.panelCountSelect = panelCountSelect;
      this.zoomLabel = this.panelElements[0]?.querySelector?.('[data-role="zoom-label"]');
      this.selectedTokenReadout = selectedTokenReadout;
      this.actionMessageElement = actionMessage;
      this.responsiveWarning = responsiveWarning;
      this.overlapChooserElement = overlapChooser;
      this.overlapChooserSelect = overlapSelect;
      this.setPanelGridStyles();
      this.updateGridDimensionControls();
      this.updateLinkControls();
      this.updateInteractionControls();
      return root;
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.detachSideControlObservers();
      this.attachSideControlObservers();
      this.detachResizeObserver();
      this.attachResizeObserver();

      if (!this.unsubscribeSynchronization
        && typeof this.synchronizationCoordinator?.subscribe === "function") {
        this.unsubscribeSynchronization = this.synchronizationCoordinator.subscribe(
          (invalidation) => this.handleSynchronizationInvalidation(invalidation)
        );
      }

      this.attached = true;
      this.initializeSharedFocus();
      this.applyDisplayMode();
      this.updateZoomLabel();
      this.updateSelectedTokenReadout();
      this.updateInteractionControls();
      this.updateViewport();
      this.requestRender({ type: "initial" });
    }

    _onPosition(position) {
      const result = super._onPosition?.(position);
      const viewport = viewportSize(this.domDocument);
      const elementRect = this.element?.getBoundingClientRect?.();
      const width = Number(position?.width) || Number(elementRect?.width) || 0;
      const height = Number(position?.height) || Number(elementRect?.height) || 0;
      const maximized = width >= viewport.width - 2 && height >= viewport.height - 2;
      if (this.element?.dataset) this.element.dataset.tacticalMaximized = String(maximized);
      if (this.shellElement?.dataset) this.shellElement.dataset.maximized = String(maximized);
      this.updateSideControlInsets();
      return result;
    }

    attachResizeObserver() {
      if (typeof globalThis?.ResizeObserver !== "function") return;
      this.resizeObservers = this.panelElements.map((panel, index) => {
        const surface = panel.querySelector?.('[data-role="panel-surface"]') ?? panel;
        const observer = new globalThis.ResizeObserver((entries) => {
          this.updateViewport(entries?.[0]?.contentRect, index);
        });
        observer.observe(surface);
        return observer;
      });
    }

    handleWorkspaceResize() {
      const previous = this.sideControlInsets;
      const next = this.updateSideControlInsets();
      const changed = Object.keys(next).some((key) => previous[key] !== next[key]);
      if (changed && this.viewerState.displayMode === "scene") this.applyDisplayMode();
      if (changed && this.attached) this.requestRender({ type: "workspace-resize" });
    }

    attachSideControlObservers() {
      this.updateSideControlInsets();
      const view = this.domDocument?.defaultView ?? globalThis;
      view?.addEventListener?.("resize", this.handleWorkspaceResize);
      if (typeof globalThis?.ResizeObserver !== "function") return;
      this.sideControlResizeObservers = sideControlElements(this.domDocument).map(({ element }) => {
        const observer = new globalThis.ResizeObserver(() => this.handleWorkspaceResize());
        observer.observe(element);
        return observer;
      });
    }

    detachSideControlObservers() {
      this.sideControlResizeObservers.forEach((observer) => observer?.disconnect?.());
      this.sideControlResizeObservers = [];
      const view = this.domDocument?.defaultView ?? globalThis;
      view?.removeEventListener?.("resize", this.handleWorkspaceResize);
    }

    detachResizeObserver() {
      this.resizeObservers.forEach((observer) => observer?.disconnect?.());
      this.resizeObservers = [];
    }

    updateViewport(rect = this.panelElements[0]?.querySelector?.('[data-role="panel-surface"]')?.getBoundingClientRect?.()
      ?? this.panelElements[0]?.getBoundingClientRect?.(), index = 0) {
      const width = Math.max(0, Number(rect?.width) || 0);
      const height = Math.max(0, Number(rect?.height) || 0);
      if (!this.viewerState.panels[index]) return this.getViewportDimensions();
      this.viewerState.panels[index].dimensions = { width, height };
      if (index === 0) this.viewport = { width, height };
      if (index === 0) this.updateResponsiveState(width);
      const canvas = this.canvases[index];
      if (canvas) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.width = Math.round(width * this.devicePixelRatio);
        canvas.height = Math.round(height * this.devicePixelRatio);
      }
      this.renderer?.invalidate?.({ type: "resize", panelIndex: index });
      this.setPanelGridStyles();
      if (this.attached) this.requestRender({ type: "resize" });
      return this.getViewportDimensions();
    }

    updateResponsiveState(width) {
      this.viewerState.responsive = getPanelLayoutState(this.viewerState.panelCount, width);
      if (this.responsiveWarning) {
        this.responsiveWarning.textContent = this.viewerState.responsive.warning
          ? localizeFormat(
            "viewer.responsiveWarning",
            this.viewerState.responsive.warning,
            {
              count: this.viewerState.responsive.panelCount,
              recommended: this.viewerState.responsive.recommendedPanelCount
            }
          )
          : "";
        this.responsiveWarning.hidden = this.viewerState.responsive.warning === "";
      }
      this.setPanelGridStyles();
      return this.viewerState.responsive;
    }

    requestRender(invalidation = undefined) {
      this.lastInvalidation = invalidation;
      if (this.renderScheduled || !this.attached) return false;
      if (typeof this.scheduler !== "function") {
        throw new TypeError("TacticalViewerApplication requires a frame scheduler");
      }

      this.renderScheduled = true;
      this.scheduledHandle = this.scheduler(() => {
        this.renderScheduled = false;
        this.scheduledHandle = undefined;
        if (this.attached) this.renderViewport();
      });
      return true;
    }

    renderViewport() {
      const visibleTacticalStates = this.refreshFromDocuments({ render: false });
      this.updateSelectedTokenReadout(visibleTacticalStates);
      for (let panelIndex = 0; panelIndex < this.viewerState.panelCount; panelIndex += 1) {
        const canvas = this.canvases[panelIndex];
        if (!canvas) continue;
        const context = canvas.getContext?.("2d");
        context?.clearRect?.(0, 0, canvas.width, canvas.height);
        const renderInput = {
          canvas,
          context,
          scene: this.scene,
          viewport: this.viewerState.panels[panelIndex].dimensions,
          panel: this.getPanelRenderState(panelIndex),
          state: this.viewerState,
          panelIndex,
          selectedTokenId: this.getSelectedTokenId(panelIndex),
          selectionBox: this.viewerState.selectionBox?.panelIndex === panelIndex
            ? this.viewerState.selectionBox
            : null,
          devicePixelRatio: this.devicePixelRatio,
          visibleTacticalStates,
          gridDimensions: this.viewerState.gridDimensions,
          background: this.viewerState.background,
          invalidation: this.lastInvalidation,
          invalidate: (invalidation) => this.requestRender(invalidation)
        };
        if (typeof this.renderer === "function") this.renderer(renderInput);
        else this.renderer?.render?.(renderInput);
        this.renderCount += 1;
      }
      return true;
    }

    teardown() {
      if (this.scheduledHandle !== undefined && this.renderScheduled) {
        this.cancelScheduler?.(this.scheduledHandle);
      }
      this.renderScheduled = false;
      this.scheduledHandle = undefined;
      this.detachResizeObserver();
      this.detachSideControlObservers();
      this.inputControllers.forEach((controller) => controller?.detach?.());
      this.inputControllers = [];
      this.shellElement?.removeEventListener?.("dragover", this.handleDragOver);
      this.shellElement?.removeEventListener?.("drop", this.handleViewerDrop);
      this.shellElement = undefined;
      this.unsubscribeSynchronization?.();
      this.unsubscribeSynchronization = undefined;
      this.attached = false;
    }

    async _preClose(options) {
      try {
        await this.persistLayout();
      } finally {
        this.teardown();
        this.onClosed?.(this, { source: "application" });
      }
      return super._preClose?.(options);
    }
  };
}

export const TacticalViewerApplication = createTacticalViewerApplicationClass();

export default TacticalViewerApplication;
