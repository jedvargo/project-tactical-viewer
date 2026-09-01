import { MODULE_ID } from "../constants.js";
import { ProjectionEngine } from "../projection/projection-engine.js";
import { VIEW_REGISTRY } from "../view-registry.js";
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

function viewFor(layout, registry) {
  const requested = layout?.panels?.[0]?.view;
  return registry.has(requested) ? requested : "top";
}

function layoutFor(scene, persistenceService) {
  if (typeof persistenceService?.getSceneLayout !== "function") return {};
  return persistenceService.getSceneLayout(scene?.id) ?? {};
}

function makeState(scene, persistenceService, registry) {
  const layout = layoutFor(scene, persistenceService);
  return {
    selectedTokenId: null,
    movementPreview: null,
    panelCount: 1,
    links: {
      selection: layout.links?.selection ?? true,
      center: layout.links?.center ?? true,
      zoom: layout.links?.zoom ?? true
    },
    panels: [{
      view: viewFor(layout, registry),
      dimensions: { width: 0, height: 0 },
      // Transient session state is intentionally not read from persistence.
      zoom: DEFAULT_LOGICAL_ZOOM,
      focus: null,
      overlays: { ...(layout.panels?.[0]?.overlays ?? {}) }
    }]
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
      this.resizeObserver = undefined;
      this.canvas = undefined;
      this.panelElement = undefined;
      this.zoomLabel = undefined;
      this.selectedTokenReadout = undefined;
      this.actionMessageElement = undefined;
      this.inputController = undefined;
      this.attached = false;
    }

    get panelCount() {
      return this.state.panelCount;
    }

    getViewportDimensions() {
      return { ...this.viewport };
    }

    getVisibleTacticalStates() {
      return this.tacticalStateService?.getVisibleTacticalStates?.(this.scene) ?? [];
    }

    buildRenderModel(visibleTacticalStates = this.getVisibleTacticalStates()) {
      return this.renderer?.buildModel?.({
        canvas: this.canvas,
        context: this.canvas?.getContext?.("2d"),
        scene: this.scene,
        viewport: this.getViewportDimensions(),
        state: this.state,
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

    createInputController() {
      if (!this.canvas || this.inputController) return this.inputController;
      this.inputController = new PanelInputController({
        element: this.canvas,
        panel: this.state.panels[0],
        projectionEngine: this.projectionEngine,
        getRenderModel: () => this.buildRenderModel(),
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
      return this.inputController;
    }

    async _renderHTML() {
      if (!this.domDocument?.createElement) {
        throw new Error("TacticalViewerApplication requires a browser document to render");
      }
      this.inputController?.detach?.();
      this.inputController = undefined;

      const root = this.domDocument.createElement("div");
      addClass(root, "tactical-viewer-shell");

      const toolbar = this.domDocument.createElement("div");
      addClass(toolbar, "tactical-viewer-panel-toolbar");
      setRole(toolbar, "panel-toolbar");

      const viewSelect = this.domDocument.createElement("select");
      viewSelect.setAttribute?.("aria-label", "Tactical projection");
      setRole(viewSelect, "view-select");
      for (const view of this.viewRegistry.list()) {
        const option = this.domDocument.createElement("option");
        option.value = view.id;
        option.textContent = view.name;
        viewSelect.appendChild(option);
      }
      viewSelect.value = this.state.panels[0].view;
      viewSelect.addEventListener?.("change", () => {
        if (this.viewRegistry.has(viewSelect.value)) {
          this.state.panels[0].view = viewSelect.value;
          this.updateInteractionControls();
          this.requestRender({ type: "view-change" });
        }
      });

      const zoomOut = makeButton(this.domDocument, "−", "zoom-out", "Zoom out");
      const zoomLabel = this.domDocument.createElement("span");
      zoomLabel.textContent = `${this.state.panels[0].zoom} px/cell`;
      setRole(zoomLabel, "zoom-label");
      const zoomIn = makeButton(this.domDocument, "+", "zoom-in", "Zoom in");
      const resetView = makeButton(this.domDocument, "Reset", "reset-view", "Reset view");
      const headingDecrease = makeButton(this.domDocument, "−45°", "heading-decrease", "Rotate heading left 45 degrees");
      const headingIncrease = makeButton(this.domDocument, "+45°", "heading-increase", "Rotate heading right 45 degrees");
      const optionsButton = makeButton(this.domDocument, "Options", "panel-options", "Panel options");
      toolbar.append(
        viewSelect,
        zoomOut,
        zoomLabel,
        zoomIn,
        resetView,
        headingDecrease,
        headingIncrease,
        optionsButton
      );

      const panel = this.domDocument.createElement("section");
      addClass(panel, "tactical-viewer-panel");
      setRole(panel, "panel");
      const canvas = this.domDocument.createElement("canvas");
      addClass(canvas, "tactical-viewer-canvas");
      setRole(canvas, "canvas");
      canvas.setAttribute?.("aria-label", "Tactical projection canvas");
      panel.appendChild(canvas);
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
      root.append(toolbar, panel);
      root.appendChild(selectedTokenReadout);
      root.appendChild(actionMessage);

      this.canvas = canvas;
      this.panelElement = panel;
      this.zoomLabel = zoomLabel;
      this.selectedTokenReadout = selectedTokenReadout;
      this.actionMessageElement = actionMessage;
      const controller = this.createInputController();
      zoomOut.addEventListener?.("click", () => controller?.zoomOut());
      zoomIn.addEventListener?.("click", () => controller?.zoomIn());
      resetView.addEventListener?.("click", () => controller?.resetView());
      headingDecrease.addEventListener?.("click", () => this.setHeadingBy(-45));
      headingIncrease.addEventListener?.("click", () => this.setHeadingBy(45));
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
      if (!this.panelElement || typeof globalThis?.ResizeObserver !== "function") return;
      this.resizeObserver = new globalThis.ResizeObserver((entries) => {
        this.updateViewport(entries?.[0]?.contentRect);
      });
      this.resizeObserver.observe(this.panelElement);
    }

    detachResizeObserver() {
      this.resizeObserver?.disconnect?.();
      this.resizeObserver = undefined;
    }

    updateViewport(rect = this.panelElement?.getBoundingClientRect?.()) {
      const width = Math.max(0, Number(rect?.width) || 0);
      const height = Math.max(0, Number(rect?.height) || 0);
      this.viewport = { width, height };
      this.state.panels[0].dimensions = { width, height };
      if (this.canvas) {
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.width = Math.round(width * this.devicePixelRatio);
        this.canvas.height = Math.round(height * this.devicePixelRatio);
      }
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
      if (!this.canvas) return false;
      const context = this.canvas.getContext?.("2d");
      context?.clearRect?.(0, 0, this.canvas.width, this.canvas.height);
      const visibleTacticalStates = this.getVisibleTacticalStates();
      this.updateSelectedTokenReadout(visibleTacticalStates);
      const renderInput = {
        canvas: this.canvas,
        context,
        scene: this.scene,
        viewport: this.getViewportDimensions(),
        state: this.state,
        devicePixelRatio: this.devicePixelRatio,
        visibleTacticalStates,
        invalidation: this.lastInvalidation
      };
      if (typeof this.renderer === "function") this.renderer(renderInput);
      else this.renderer?.render?.(renderInput);
      this.renderCount += 1;
      return true;
    }

    teardown() {
      if (this.scheduledHandle !== undefined && this.renderScheduled) {
        this.cancelScheduler?.(this.scheduledHandle);
      }
      this.renderScheduled = false;
      this.scheduledHandle = undefined;
      this.detachResizeObserver();
      this.inputController?.detach?.();
      this.inputController = undefined;
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
