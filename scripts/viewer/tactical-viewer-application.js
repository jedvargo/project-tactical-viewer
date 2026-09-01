import { ALLOWED_PITCHES, MODULE_ID } from "../constants.js";
import { ProjectionEngine } from "../projection/projection-engine.js";
import { isRenderableOrthographicView } from "../rendering/canvas-renderer.js";
import { VIEW_REGISTRY } from "../view-registry.js";
import {
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  PANEL_COUNTS,
  clampSplitterProportion,
  defaultPanelAreas,
  normalizePanelCount,
  normalizePanelLayout
} from "./panel-layout.js";
import { DEFAULT_OVERLAYS } from "../persistence/migrations.js";
import {
  DEFAULT_LOGICAL_ZOOM,
  PanelInputController
} from "./panel-input-controller.js";

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

function viewFor(layout, index, registry) {
  const requested = layout?.panels?.[index]?.view;
  return registry.has(requested) && isRenderableOrthographicView(requested) ? requested : "top";
}

function layoutFor(scene, persistenceService) {
  if (typeof persistenceService?.getSceneLayout !== "function") return {};
  return persistenceService.getSceneLayout(scene?.id) ?? {};
}

function makeState(scene, persistenceService, registry) {
  const layout = normalizePanelLayout(layoutFor(scene, persistenceService));
  return {
    selectedTokenId: null,
    movementPreview: null,
    panelCount: layout.panelCount,
    splits: layout.splits.slice(),
    links: {
      selection: layout.links?.selection ?? true,
      center: layout.links?.center ?? true,
      zoom: layout.links?.zoom ?? true
    },
    panels: layout.panels.map((panel, index) => ({
      // Isometric rendering is intentionally deferred to P21. Keep the
      // persisted choice in the service, but expose a safe active view here.
      view: viewFor(layout, index, registry),
      dimensions: { width: 0, height: 0 },
      // Transient session state is intentionally not read from persistence.
      zoom: DEFAULT_LOGICAL_ZOOM,
      focus: null,
      overlays: { ...DEFAULT_OVERLAYS, ...(panel.overlays ?? {}) }
    }))
  };
}

function sceneTokenById(scene, tokenId) {
  const tokens = scene?.tokens;
  if (typeof tokens?.get === "function") return tokens.get(tokenId);
  if (Array.isArray(tokens)) return tokens.find((token) => (token?.id ?? token?._id) === tokenId);
  if (tokens && typeof tokens === "object") return tokens[tokenId];
  return null;
}

function actionMessage(result) {
  if (result?.status === "conflict") return "Token changed remotely; movement canceled.";
  if (result?.reason === "rotation-locked") return "Token rotation is locked.";
  if (result?.reason === "locked") return "Token movement is locked.";
  if (result?.reason === "permission") return "You cannot update this token.";
  if (result?.status === "rejected") return "Token update was rejected.";
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
      window: { title: "3D Tactical Viewer", resizable: true }
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
      this.projectionEngine = projectionEngine;
      this.state = makeState(scene, persistenceService, viewRegistry);
      this.viewport = { width: 0, height: 0 };
      this.renderCount = 0;
      this.renderScheduled = false;
      this.scheduledHandle = undefined;
      this.lastInvalidation = undefined;
      this.unsubscribeSynchronization = undefined;
      this.resizeObservers = [];
      this.canvases = [];
      this.panelElements = [];
      this.panelGridElement = undefined;
      this.panelCountSelect = undefined;
      this.zoomLabel = undefined;
      this.pitchSelect = undefined;
      this.selectedTokenReadout = undefined;
      this.actionMessageElement = undefined;
      this.inputControllers = [];
      this.attached = false;
    }

    get panelCount() {
      return this.state.panelCount;
    }

    getViewportDimensions() {
      return { ...this.state.panels[0].dimensions };
    }

    getVisibleTacticalStates() {
      return this.tacticalStateService?.getVisibleTacticalStates?.(this.scene) ?? [];
    }

    buildRenderModel(
      visibleTacticalStates = this.getVisibleTacticalStates(),
      panelIndex = 0
    ) {
      const panel = this.state.panels[panelIndex] ?? this.state.panels[0];
      return this.renderer?.buildModel?.({
        canvas: this.canvases[panelIndex],
        context: this.canvases[panelIndex]?.getContext?.("2d"),
        scene: this.scene,
        viewport: panel.dimensions,
        state: this.state,
        panelIndex,
        panel,
        devicePixelRatio: this.devicePixelRatio,
        visibleTacticalStates
      }) ?? null;
    }

    updateZoomLabel() {
      if (this.zoomLabel) {
        this.zoomLabel.textContent = `${Math.round(this.state.panels[0].zoom)} px/cell`;
      }
    }

    updateSelectedTokenReadout(visibleTacticalStates = this.getVisibleTacticalStates()) {
      if (!this.selectedTokenReadout) return;
      const states = Array.isArray(visibleTacticalStates) ? visibleTacticalStates : [];
      const selected = states.find((state) =>
        state?.tokenId === this.state.selectedTokenId
      );
      if (!selected) {
        if (this.state.selectedTokenId !== null) this.state.selectedTokenId = null;
        this.selectedTokenReadout.textContent = "No tactical token selected";
        return;
      }
      const label = selected.name || selected.tokenId;
      this.selectedTokenReadout.textContent = [
        `Selected ${label}`,
        `X ${selected.tacticalX}`,
        `Y ${selected.tacticalY}`,
        `Z ${selected.tacticalZ}`
      ].join(" · ");
    }

    handleSelectionChanged(tokenId) {
      this.state.selectedTokenId = tokenId;
      this.updateSelectedTokenReadout();
      this.updateInteractionControls();
    }

    getSelectedTacticalState() {
      return this.getVisibleTacticalStates().find((state) =>
        state?.tokenId === this.state.selectedTokenId
      );
    }

    getTokenById(tokenId) {
      return sceneTokenById(this.scene, tokenId);
    }

    serializeLayout() {
      return {
        panelCount: this.state.panelCount,
        panels: this.state.panels.map((panel) => ({
          view: panel.view,
          overlays: { ...panel.overlays }
        })),
        splits: this.state.splits.slice(),
        links: { ...this.state.links }
      };
    }

    persistLayout() {
      if (typeof this.persistenceService?.saveSceneLayout !== "function") return null;
      return this.persistenceService.saveSceneLayout(
        this.scene.id,
        this.serializeLayout()
      );
    }

    async setPanelCount(value) {
      const panelCount = normalizePanelCount(Number(value), this.state.panelCount);
      if (panelCount === this.state.panelCount) return panelCount;
      this.state.panelCount = panelCount;
      await this.persistLayout();
      if (this.attached && typeof this.render === "function") await this.render(true);
      return panelCount;
    }

    async setPanelView(index, view) {
      if (!Number.isInteger(index) || index < 0 || index >= this.state.panels.length) {
        return false;
      }
      if (!this.viewRegistry.has(view) || !isRenderableOrthographicView(view)) return false;
      this.state.panels[index].view = view;
      await this.persistLayout();
      this.updatePanelControls(index);
      this.updateInteractionControls();
      this.requestRender({ type: "view-change", panelIndex: index, view });
      return true;
    }

    async setPanelOverlay(index, key, enabled) {
      const panel = this.state.panels[index];
      if (!panel || !Object.hasOwn(DEFAULT_OVERLAYS, key)) return false;
      panel.overlays[key] = enabled === true;
      await this.persistLayout();
      this.requestRender({ type: "overlay-change", panelIndex: index, key });
      return true;
    }

    setPanelGridStyles() {
      if (!this.panelGridElement) return;
      const areas = defaultPanelAreas(this.state.panelCount);
      const [columnSplit, rowSplit] = this.state.splits;
      this.panelGridElement.style.setProperty?.(
        "--tactical-column-split", `${columnSplit * 100}%`
      );
      this.panelGridElement.style.setProperty?.(
        "--tactical-row-split", `${rowSplit * 100}%`
      );
      this.panelGridElement.style.gridTemplateColumns = this.state.panelCount === 1
        ? "minmax(0, 1fr)"
        : "minmax(0, var(--tactical-column-split)) minmax(0, 1fr)";
      this.panelGridElement.style.gridTemplateRows = this.state.panelCount >= 3
        ? "minmax(0, var(--tactical-row-split)) minmax(0, 1fr)"
        : "minmax(0, 1fr)";
      this.panelElements.forEach((panel, index) => {
        const area = areas[index];
        if (!area) return;
        panel.style.gridColumn = `${area.column} / span ${area.columnSpan}`;
        panel.style.gridRow = `${area.row} / span ${area.rowSpan}`;
      });
      const splitters = [
        this.panelGridElement.querySelector?.('[data-role="splitter-columns"]'),
        this.panelGridElement.querySelector?.('[data-role="splitter-rows"]')
      ].filter(Boolean);
      for (const splitter of splitters) {
        splitter.hidden = splitter.dataset.axis === "columns"
          ? this.state.panelCount < 2
          : this.state.panelCount < 3;
        splitter.setAttribute?.("aria-valuenow", String(
          splitter.dataset.axis === "columns" ? columnSplit : rowSplit
        ));
      }
      const rowSplitter = this.panelGridElement.querySelector?.('[data-role="splitter-rows"]');
      if (rowSplitter) rowSplitter.style.left = this.state.panelCount === 3
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
      this.state.splits[splitIndex] = proportion;
      this.setPanelGridStyles();
      this.persistLayout();
      this.requestRender({ type: "splitter-change", axis, proportion });
      return proportion;
    }

    updatePanelControls(index) {
      const panelElement = this.panelElements[index];
      const panel = this.state.panels[index];
      if (!panelElement || !panel) return;
      const select = panelElement.querySelector?.('[data-role="view-select"]');
      if (select) select.value = panel.view;
      for (const key of Object.keys(DEFAULT_OVERLAYS)) {
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
      const selected = visibleTacticalStates.find((state) =>
        state?.tokenId === this.state.selectedTokenId
      );
      const disabled = this.state.panels[0]?.view !== "top"
        || selected?.canCurrentUserRotate !== true;
      for (const role of ["heading-decrease", "heading-increase"]) {
        const control = this.element?.querySelector?.(`[data-role="${role}"]`);
        if (control) control.disabled = disabled;
      }
      const pitchDisabled = !["north", "south", "east", "west"].includes(this.state.panels[0]?.view)
        || selected?.canCurrentUserRotate !== true;
      if (this.pitchSelect) {
        this.pitchSelect.disabled = pitchDisabled;
        if (selected && Number.isFinite(selected.pitch)) {
          this.pitchSelect.value = String(selected.pitch);
        }
      }
    }

    handleMovementPreview(preview) {
      this.state.movementPreview = preview;
      this.requestRender({ type: preview ? "movement-preview" : "movement-preview-cleared" });
    }

    handleActionResult(result) {
      this.state.movementPreview = null;
      if (this.actionMessageElement) this.actionMessageElement.textContent = actionMessage(result);
      this.requestRender({ type: "tactical-action-result", status: result?.status });
    }

    async setHeadingBy(delta) {
      const selected = this.getSelectedTacticalState();
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!selected || !document || typeof this.tacticalUpdateService?.setHeading !== "function") {
        return null;
      }
      const snapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
      const result = await this.tacticalUpdateService.setHeading(
        document,
        selected.heading + delta,
        snapshot
      );
      this.handleActionResult(result);
      return result;
    }

    async setPitchTo(pitch) {
      const selected = this.getSelectedTacticalState();
      const document = selected ? this.getTokenById(selected.tokenId) : null;
      if (!selected || !document || typeof this.tacticalUpdateService?.setPitch !== "function") {
        return null;
      }
      const snapshot = this.tacticalUpdateService.captureInteractionSnapshot(document);
      const result = await this.tacticalUpdateService.setPitch(document, pitch, snapshot);
      this.handleActionResult(result);
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
        panel: this.state.panels[index],
        projectionEngine: this.projectionEngine,
        getRenderModel: () => this.buildRenderModel(undefined, index),
        scene: this.scene,
        coordinateAdapter: this.coordinateAdapter,
        tacticalUpdateService: this.tacticalUpdateService,
        getTokenById: (tokenId) => this.getTokenById(tokenId),
        onSelectionChanged: (tokenId) => this.handleSelectionChanged(tokenId),
        onViewChanged: () => this.updateZoomLabel(),
        onMovementPreview: (preview) => this.handleMovementPreview(preview),
        onActionResult: (result) => this.handleActionResult(result),
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

      const toolbar = this.domDocument.createElement("div");
      addClass(toolbar, "tactical-viewer-shared-toolbar");
      setRole(toolbar, "shared-toolbar");
      const panelCountLabel = this.domDocument.createElement("label");
      panelCountLabel.textContent = "Panels";
      const panelCountSelect = this.domDocument.createElement("select");
      panelCountSelect.setAttribute?.("aria-label", "Panel count");
      setRole(panelCountSelect, "panel-count");
      for (const count of PANEL_COUNTS) {
        const option = this.domDocument.createElement("option");
        option.value = String(count);
        option.textContent = String(count);
        panelCountSelect.appendChild(option);
      }
      panelCountSelect.value = String(this.state.panelCount);
      panelCountSelect.addEventListener?.("change", () => this.setPanelCount(panelCountSelect.value));
      toolbar.append(panelCountLabel, panelCountSelect);

      const panelGrid = this.domDocument.createElement("div");
      addClass(panelGrid, "tactical-viewer-panel-grid");
      setRole(panelGrid, "panel-grid");

      this.panelElements = [];
      this.canvases = [];
      for (let index = 0; index < this.state.panelCount; index += 1) {
        const panel = this.domDocument.createElement("section");
        addClass(panel, "tactical-viewer-panel");
        setRole(panel, "panel");
        panel.dataset.panelIndex = String(index);

        const panelToolbar = this.domDocument.createElement("div");
        addClass(panelToolbar, "tactical-viewer-panel-toolbar");
        setRole(panelToolbar, "panel-toolbar");
        const viewSelect = this.domDocument.createElement("select");
        viewSelect.setAttribute?.("aria-label", `Panel ${index + 1} projection`);
        setRole(viewSelect, "view-select");
        for (const view of this.viewRegistry.list().filter(({ id }) => isRenderableOrthographicView(id))) {
          const option = this.domDocument.createElement("option");
          option.value = view.id;
          option.textContent = view.name;
          viewSelect.appendChild(option);
        }
        viewSelect.value = this.state.panels[index].view;
        viewSelect.addEventListener?.("change", () => this.setPanelView(index, viewSelect.value));

        const zoomOut = makeButton(this.domDocument, "−", "zoom-out", "Zoom out");
        const zoomLabel = this.domDocument.createElement("span");
        zoomLabel.textContent = `${this.state.panels[index].zoom} px/cell`;
        setRole(zoomLabel, "zoom-label");
        const zoomIn = makeButton(this.domDocument, "+", "zoom-in", "Zoom in");
        const resetView = makeButton(this.domDocument, "Reset", "reset-view", "Reset view");
        const headingDecrease = makeButton(this.domDocument, "−45°", "heading-decrease", "Rotate heading left 45 degrees");
        const headingIncrease = makeButton(this.domDocument, "+45°", "heading-increase", "Rotate heading right 45 degrees");
        const pitchSelect = this.domDocument.createElement("select");
        pitchSelect.setAttribute?.("aria-label", "Pitch");
        setRole(pitchSelect, "pitch-select");
        for (const pitch of ALLOWED_PITCHES) {
          const option = this.domDocument.createElement("option");
          option.value = String(pitch);
          option.textContent = `${pitch > 0 ? "+" : ""}${pitch}°`;
          pitchSelect.appendChild(option);
        }
        pitchSelect.addEventListener?.("change", () => {
          const pitch = Number(pitchSelect.value);
          if (ALLOWED_PITCHES.includes(pitch)) this.setPitchTo(pitch);
        });
        const optionsButton = makeButton(this.domDocument, "Options", "panel-options", "Panel options");
        const options = this.domDocument.createElement("div");
        addClass(options, "tactical-viewer-overlay-options");
        options.hidden = true;
        optionsButton.addEventListener?.("click", () => {
          options.hidden = !options.hidden;
        });
        for (const key of Object.keys(DEFAULT_OVERLAYS)) {
          const label = this.domDocument.createElement("label");
          const checkbox = this.domDocument.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = this.state.panels[index].overlays[key] === true;
          setRole(checkbox, `overlay-${key}`);
          checkbox.setAttribute?.("aria-label", `${key} overlay`);
          checkbox.addEventListener?.("change", () => this.setPanelOverlay(index, key, checkbox.checked));
          label.textContent = key;
          label.appendChild(checkbox);
          options.appendChild(label);
        }
        panelToolbar.append(
          viewSelect, zoomOut, zoomLabel, zoomIn, resetView,
          headingDecrease, headingIncrease, pitchSelect, optionsButton, options
        );

        const canvas = this.domDocument.createElement("canvas");
        addClass(canvas, "tactical-viewer-canvas");
        setRole(canvas, "canvas");
        canvas.setAttribute?.("aria-label", `Panel ${index + 1} tactical projection canvas`);
        panel.append(panelToolbar, canvas);
        panelGrid.appendChild(panel);
        this.panelElements.push(panel);
        this.canvases.push(canvas);
        const controller = this.createPanelInputController(index);
        zoomOut.addEventListener?.("click", () => controller?.zoomOut());
        zoomIn.addEventListener?.("click", () => controller?.zoomIn());
        resetView.addEventListener?.("click", () => controller?.resetView());
        headingDecrease.addEventListener?.("click", () => this.setHeadingBy(-45));
        headingIncrease.addEventListener?.("click", () => this.setHeadingBy(45));
      }

      const columnSplitter = this.domDocument.createElement("div");
      setRole(columnSplitter, "splitter-columns");
      columnSplitter.dataset.axis = "columns";
      columnSplitter.setAttribute?.("role", "separator");
      columnSplitter.addEventListener?.("pointerdown", (event) => this.beginSplitterDrag("columns", columnSplitter, event));
      panelGrid.appendChild(columnSplitter);
      const rowSplitter = this.domDocument.createElement("div");
      setRole(rowSplitter, "splitter-rows");
      rowSplitter.dataset.axis = "rows";
      rowSplitter.setAttribute?.("role", "separator");
      rowSplitter.addEventListener?.("pointerdown", (event) => this.beginSplitterDrag("rows", rowSplitter, event));
      panelGrid.appendChild(rowSplitter);

      const selectedTokenReadout = this.domDocument.createElement("div");
      addClass(selectedTokenReadout, "tactical-viewer-selected-token-readout");
      selectedTokenReadout.setAttribute?.("aria-live", "polite");
      selectedTokenReadout.setAttribute?.("aria-atomic", "true");
      setRole(selectedTokenReadout, "selected-token-readout");
      selectedTokenReadout.textContent = "No tactical token selected";
      const actionMessage = this.domDocument.createElement("div");
      addClass(actionMessage, "tactical-viewer-action-message");
      actionMessage.setAttribute?.("aria-live", "polite");
      setRole(actionMessage, "action-message");
      root.append(toolbar, panelGrid);
      root.appendChild(selectedTokenReadout);
      root.appendChild(actionMessage);

      this.panelGridElement = panelGrid;
      this.panelCountSelect = panelCountSelect;
      this.zoomLabel = this.panelElements[0]?.querySelector?.('[data-role="zoom-label"]');
      this.pitchSelect = this.panelElements[0]?.querySelector?.('[data-role="pitch-select"]');
      this.selectedTokenReadout = selectedTokenReadout;
      this.actionMessageElement = actionMessage;
      this.setPanelGridStyles();
      this.updateInteractionControls();
      return root;
    }

    async _onRender(context, options) {
      await super._onRender?.(context, options);
      this.detachResizeObserver();
      this.attachResizeObserver();

      if (!this.unsubscribeSynchronization
        && typeof this.synchronizationCoordinator?.subscribe === "function") {
        this.unsubscribeSynchronization = this.synchronizationCoordinator.subscribe(
          (invalidation) => this.requestRender(invalidation)
        );
      }

      this.attached = true;
      this.updateZoomLabel();
      this.updateSelectedTokenReadout();
      this.updateInteractionControls();
      this.updateViewport();
      this.requestRender({ type: "initial" });
    }

    attachResizeObserver() {
      if (typeof globalThis?.ResizeObserver !== "function") return;
      this.resizeObservers = this.panelElements.map((panel, index) => {
        const observer = new globalThis.ResizeObserver((entries) => {
          this.updateViewport(entries?.[0]?.contentRect, index);
        });
        observer.observe(panel);
        return observer;
      });
    }

    detachResizeObserver() {
      this.resizeObservers.forEach((observer) => observer?.disconnect?.());
      this.resizeObservers = [];
    }

    updateViewport(rect = this.panelElements[0]?.getBoundingClientRect?.(), index = 0) {
      const width = Math.max(0, Number(rect?.width) || 0);
      const height = Math.max(0, Number(rect?.height) || 0);
      if (!this.state.panels[index]) return this.getViewportDimensions();
      this.state.panels[index].dimensions = { width, height };
      if (index === 0) this.viewport = { width, height };
      const canvas = this.canvases[index];
      if (canvas) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.width = Math.round(width * this.devicePixelRatio);
        canvas.height = Math.round(height * this.devicePixelRatio);
      }
      this.setPanelGridStyles();
      if (this.attached) this.requestRender({ type: "resize" });
      return this.getViewportDimensions();
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
      const visibleTacticalStates = this.getVisibleTacticalStates();
      this.updateSelectedTokenReadout(visibleTacticalStates);
      for (let panelIndex = 0; panelIndex < this.state.panelCount; panelIndex += 1) {
        const canvas = this.canvases[panelIndex];
        if (!canvas) continue;
        const context = canvas.getContext?.("2d");
        context?.clearRect?.(0, 0, canvas.width, canvas.height);
        const renderInput = {
          canvas,
          context,
          scene: this.scene,
          viewport: this.state.panels[panelIndex].dimensions,
          state: this.state,
          panelIndex,
          devicePixelRatio: this.devicePixelRatio,
          visibleTacticalStates,
          invalidation: this.lastInvalidation
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
      this.inputControllers.forEach((controller) => controller?.detach?.());
      this.inputControllers = [];
      this.unsubscribeSynchronization?.();
      this.unsubscribeSynchronization = undefined;
      this.attached = false;
    }

    async _preClose(options) {
      this.teardown();
      return super._preClose?.(options);
    }
  };
}

export const TacticalViewerApplication = createTacticalViewerApplicationClass();

export default TacticalViewerApplication;
