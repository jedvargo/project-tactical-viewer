import { MODULE_ID } from "../constants.js";
import { VIEW_REGISTRY } from "../view-registry.js";

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
    panelCount: 1,
    links: {
      selection: layout.links?.selection ?? true,
      center: layout.links?.center ?? true,
      zoom: layout.links?.zoom ?? true
    },
    panels: [{
      view: viewFor(layout, registry),
      dimensions: { width: 0, height: 0 },
      scale: 1,
      overlays: { ...(layout.panels?.[0]?.overlays ?? {}) }
    }]
  };
}

function addClass(element, className) {
  element.classList?.add?.(className);
}

function setRole(element, role) {
  element.dataset.role = role;
  element.setAttribute?.("data-role", role);
}

function makeButton(document, label, role) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute?.("aria-label", label);
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
        viewRegistry = VIEW_REGISTRY,
        scheduler = defaultFrameScheduler,
        cancelScheduler = defaultFrameCanceller,
        document,
        devicePixelRatio,
        renderer,
        ...applicationOptions
      } = options;

      if (!scene || typeof scene !== "object") {
        throw new TypeError("TacticalViewerApplication requires a Scene");
      }

      super(applicationOptions);
      this.scene = scene;
      this.persistenceService = persistenceService;
      this.synchronizationCoordinator = synchronizationCoordinator;
      this.viewRegistry = viewRegistry;
      this.domDocument = document ?? documentFor({ document });
      this.scheduler = scheduler;
      this.cancelScheduler = cancelScheduler;
      this.devicePixelRatio = Number.isFinite(devicePixelRatio)
        ? Math.max(1, devicePixelRatio)
        : Math.max(1, globalThis?.devicePixelRatio ?? 1);
      this.renderer = renderer;
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
      this.attached = false;
    }

    get panelCount() {
      return this.state.panelCount;
    }

    getViewportDimensions() {
      return { ...this.viewport };
    }

    async _renderHTML() {
      if (!this.domDocument?.createElement) {
        throw new Error("TacticalViewerApplication requires a browser document to render");
      }

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
          this.requestRender({ type: "view-change" });
        }
      });

      const zoomOut = makeButton(this.domDocument, "−", "zoom-out");
      const zoomLabel = this.domDocument.createElement("span");
      zoomLabel.textContent = "100%";
      setRole(zoomLabel, "zoom-label");
      const zoomIn = makeButton(this.domDocument, "+", "zoom-in");
      const optionsButton = makeButton(this.domDocument, "Options", "panel-options");
      toolbar.append(viewSelect, zoomOut, zoomLabel, zoomIn, optionsButton);

      const panel = this.domDocument.createElement("section");
      addClass(panel, "tactical-viewer-panel");
      setRole(panel, "panel");
      const canvas = this.domDocument.createElement("canvas");
      addClass(canvas, "tactical-viewer-canvas");
      setRole(canvas, "canvas");
      canvas.setAttribute?.("aria-label", "Tactical projection canvas");
      panel.appendChild(canvas);
      root.append(toolbar, panel);

      this.canvas = canvas;
      this.panelElement = panel;
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
      this.renderer?.({
        canvas: this.canvas,
        context,
        viewport: this.getViewportDimensions(),
        state: this.state,
        invalidation: this.lastInvalidation
      });
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
