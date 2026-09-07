import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTacticalViewerApplicationClass,
  getSideControlInsets
} from "../../scripts/viewer/tactical-viewer-application.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {
      setProperty: (name, value) => { this.style[name] = String(value); },
      getPropertyValue: (name) => this.style[name] ?? ""
    };
    this.listeners = new Map();
    this.classList = {
      values: new Set(),
      add: (...values) => values.forEach((value) => this.classList.values.add(value)),
      contains: (value) => this.classList.values.has(value)
    };
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this._rect = { width: 640, height: 360 };
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      if (matchesSelector(element, selector)) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

function matchesSelector(element, selector) {
  if (selector === "canvas") return element.tagName === "CANVAS";
  const role = selector.match(/^\[data-role="([^"]+)"\]$/);
  return role ? element.dataset.role === role[1] : false;
}

function createFakeDocument() {
  const document = {
    createElement(tagName) {
      const element = new FakeElement(tagName, document);
      if (tagName === "canvas") {
        element.getContext = vi.fn(() => ({
          clearRect: vi.fn(),
          setTransform: vi.fn()
        }));
      }
      return element;
    }
  };
  return document;
}

class FakeApplicationV2 {
  static DEFAULT_OPTIONS = {};

  constructor(options = {}) {
    this.options = options;
    this._applicationState = Object.freeze({ inherited: true });
    this.element = null;
    this.rendered = false;
  }

  get state() {
    return this._applicationState;
  }

  async render() {
    this.element = await this._renderHTML({}, {});
    this.rendered = true;
    await this._onRender({}, {});
    return this;
  }

  async close() {
    await this._preClose({});
    this.rendered = false;
    return this;
  }
}

class StrictApplicationV2 extends FakeApplicationV2 {
  async render(options = {}) {
    if (typeof this._renderHTML !== "function" || typeof this._replaceHTML !== "function") {
      throw new Error("Application class is not renderable because it does not implement the abstract methods _renderHTML and _replaceHTML");
    }
    const content = this.domDocument.createElement("div");
    const result = await this._renderHTML({}, options);
    this._replaceHTML(result, content, options);
    this.element = content;
    this.rendered = true;
    await this._onRender({}, options);
    return this;
  }
}

class FakeResizeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.disconnect = vi.fn();
    FakeResizeObserver.instances.push(this);
  }

  observe(element) {
    this.element = element;
  }

  trigger(width, height) {
    this.callback([{ contentRect: { width, height } }]);
  }
}

function createScheduler() {
  const callbacks = [];
  const scheduler = vi.fn((callback) => {
    callbacks.push(callback);
    return callback;
  });
  scheduler.flush = () => callbacks.splice(0).forEach((callback) => callback());
  scheduler.pendingCount = () => callbacks.length;
  return scheduler;
}

function createScene() {
  return { id: "scene-1", name: "Battlefield" };
}

describe("TacticalViewerApplication", () => {
  beforeEach(() => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders through the Foundry v14 custom ApplicationV2 contract", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: StrictApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await expect(application.render({ force: true })).resolves.toBe(application);

    expect(application.element.children).toHaveLength(1);
    expect(application.element.querySelector("canvas")).not.toBeNull();
    expect(application.inputControllers[0].keyboardTarget).toBe(
      application.element.querySelector('[data-role="panel-surface"]')
    );
  });

  it("constructs the persisted multi-panel ApplicationV2 shell", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const unsubscribe = vi.fn();
    const synchronizationCoordinator = {
      subscribe: vi.fn(() => unsubscribe)
    };
    const persistenceService = {
      getSceneLayout: vi.fn(() => ({
        panelCount: 4,
        panels: [{ view: "north" }, { view: "east" }, { view: "south" }, { view: "west" }],
        links: { selection: true, center: true, zoom: true }
      }))
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService,
      synchronizationCoordinator,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    expect(application.viewerState.panelCount).toBe(4);
    expect(application.viewerState.panels).toHaveLength(4);
    expect(application.viewerState.panels[0].view).toBe("front");
    expect(persistenceService.getSceneLayout).toHaveBeenCalledWith("scene-1");

    await application.render(true);

    expect(application.element.querySelectorAll("canvas")).toHaveLength(4);
    expect(application.element.querySelector('[data-role="panel-toolbar"]')).not.toBeNull();
    expect(synchronizationCoordinator.subscribe).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount()).toBe(1);
  });

  it("transitions panel counts, restores hidden panel configuration, and permits duplicate views", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const saveSceneLayout = vi.fn(async (_sceneId, layout) => layout);
    const persistenceService = {
      getSceneLayout: () => ({
        panelCount: 1,
        panels: [{ view: "top" }, { view: "east" }, { view: "south" }, { view: "west" }],
        splits: [0.5, 0.5]
      }),
      saveSceneLayout
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService,
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    await application.setPanelView(1, "top");
    await application.setPanelCount(2);
    await application.setPanelCount(3);
    await application.setPanelCount(4);
    await application.setPanelCount(2);

    expect(application.panelCount).toBe(2);
    expect(application.viewerState.panels.map(({ view }) => view)).toEqual([
      "top", "top", "back", "left"
    ]);
    expect(application.element.querySelectorAll("canvas")).toHaveLength(2);
    expect(saveSceneLayout).toHaveBeenCalled();
    expect(saveSceneLayout.mock.calls.at(-1)[1]).toMatchObject({
      panelCount: 2,
      panels: [{ view: "top" }, { view: "top" }, { view: "back" }, { view: "left" }]
    });
  });

  it("renders every visible panel from one canonical state list on one invalidation", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    let invalidate;
    const visibleStates = [{ tokenId: "ship", visibleToCurrentUser: true }];
    const tokenDocument = { id: "ship", update: vi.fn() };
    const renderer = { render: vi.fn() };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => visibleStates)
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [tokenDocument] },
      persistenceService: {
        getSceneLayout: () => ({
          panelCount: 3,
      panels: [{ view: "top" }, { view: "front" }, { view: "right" }]
        })
      },
      synchronizationCoordinator: {
        subscribe: (listener) => {
          invalidate = listener;
          return () => {};
        }
      },
      tacticalStateService,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    renderer.render.mockClear();
    tacticalStateService.getVisibleTacticalStates.mockClear();
    invalidate({ type: "token-invalidation", tokenId: "ship" });
    invalidate({ type: "token-invalidation", tokenId: "ship" });
    scheduler.flush();

    expect(tacticalStateService.getVisibleTacticalStates).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(tokenDocument.update).not.toHaveBeenCalled();
    expect(renderer.render.mock.calls.map(([input]) => input.state.panels[input.panelIndex].view))
      .toEqual(["top", "front", "right"]);
  });

  it("persists panel views, overlays, and clamped splitter proportions", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const saveSceneLayout = vi.fn(async (_sceneId, layout) => layout);
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: {
        getSceneLayout: () => ({ panelCount: 2, panels: [{ view: "top" }, { view: "north" }] }),
        saveSceneLayout
      },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    await application.setPanelView(1, "east");
    await application.setPanelOverlay(1, "names", false);
    application.setSplitter("columns", 0.01);

    const saved = saveSceneLayout.mock.calls.at(-1)[1];
    expect(saved.panelCount).toBe(2);
    expect(saved.panels[0].view).toBe("top");
    expect(saved.panels[1]).toMatchObject({ view: "right", overlays: { names: false } });
    expect(saved.splits).toEqual([0.28125, 0.5]);
  });

  it("persists grid controls and display mode without changing the Scene", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const saveSceneLayout = vi.fn(async (_sceneId, layout) => layout);
    const scene = { ...createScene(), dimensions: { width: 1200, height: 800 } };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene,
      persistenceService: {
        getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }),
        saveSceneLayout
      },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    await application.setPanelGridOpacity(0, 0.3);
    await application.setGridDimensions(12, 8);
    await application.setDisplayMode("scene");

    expect(application.viewerState.panels[0].overlays.gridOpacity).toBe(0.3);
    expect(application.viewerState.gridDimensions).toEqual({ x: 12, y: 8, z: 10 });
    expect(application.viewerState.displayMode).toBe("scene");
    expect(scene.dimensions).toEqual({ width: 1200, height: 800 });
    expect(saveSceneLayout.mock.calls.at(-1)[1]).toMatchObject({
      gridDimensions: { x: 12, y: 8, z: 10 },
      displayMode: "scene"
    });
    expect(saveSceneLayout.mock.calls.at(-1)[1].panels[0].overlays.gridOpacity).toBe(0.3);
  });

  it("starts with the Scene grid dimensions when no viewer dimensions are saved", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const scene = {
      ...createScene(),
      dimensions: { width: 1200, height: 800 },
      grid: { size: 100 }
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene,
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    expect(application.viewerState.gridDimensions).toEqual({ x: 12, y: 8, z: 10 });
  });

  it("keeps the maximized replacement grid clear of Foundry side controls", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const controls = document.createElement("div");
    controls._rect = { left: 0, right: 64, top: 80, bottom: 700, width: 64, height: 620 };
    const sidebar = document.createElement("div");
    sidebar._rect = { left: 900, right: 1200, top: 0, bottom: 800, width: 300, height: 800 };
    vi.stubGlobal("ui", { controls: { element: controls }, sidebar: { element: sidebar } });
    vi.stubGlobal("innerWidth", 1200);
    vi.stubGlobal("innerHeight", 800);

    expect(getSideControlInsets(document)).toEqual({ left: 72, right: 308, top: 0, bottom: 0 });

    class PositionedApplicationV2 extends FakeApplicationV2 {
      setPosition(position) {
        this.position = { ...(this.position ?? {}), ...position };
      }
    }
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: PositionedApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), dimensions: { width: 2000, height: 1200 } },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    await application.setDisplayMode("replace");

    expect(application.element.style.getPropertyValue("--tactical-side-left")).toBe("72px");
    expect(application.element.style.getPropertyValue("--tactical-side-right")).toBe("308px");

    await application.setDisplayMode("scene");
    expect(application.position).toMatchObject({ left: 72, width: 820, height: 800 });

    sidebar._rect = { left: 1000, right: 1200, top: 0, bottom: 800, width: 200, height: 800 };
    FakeResizeObserver.instances.find((observer) => observer.element === sidebar)?.trigger(0, 0);
    expect(application.element.style.getPropertyValue("--tactical-side-right")).toBe("208px");
  });

  it("creates a snapped TokenDocument when an icon is dropped on an orthographic panel", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const created = [];
    const scene = {
      ...createScene(),
      createEmbeddedDocuments: vi.fn(async (type, records) => {
        created.push({ type, records });
        return records;
      }),
      canUserModify: vi.fn(() => true)
    };
    const renderer = {
      buildModel: vi.fn(() => ({
        view: "top",
        camera: {
          view: "top",
          focus: { x: 3, y: 2, z: 0 },
          scale: 100,
          screenCenter: { x: 320, y: 180 }
        }
      })),
      render: vi.fn()
    };
    const coordinateAdapter = {
      toTokenPosition: vi.fn(() => ({ x: 200, y: 100 })),
      toElevation: vi.fn(() => 0)
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene,
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      coordinateAdapter,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    vi.stubGlobal("game", { user: { isGM: true } });
    await application.render(true);
    const canvas = application.element.querySelector("canvas");
    const result = await application.handleViewerDrop({
      target: canvas,
      clientX: 320,
      clientY: 180,
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: () => JSON.stringify({ type: "Image", src: "icons/ship.webp" })
      }
    });

    expect(result.status).toBe("accepted");
    expect(created[0].type).toBe("Token");
    expect(created[0].records[0]).toMatchObject({
      x: 200,
      y: 100,
      elevation: 0,
      texture: { src: "icons/ship.webp" }
    });
    expect(coordinateAdapter.toTokenPosition).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("offers every fixed projection view", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);

    const select = application.element.querySelector('[data-role="view-select"]');
    expect(select.children.map((option) => option.value)).toEqual([
      "top", "bottom", "left", "right", "front", "back", "isometric"
    ]);
  });

  it("keeps the isometric choice active in every panel dropdown", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: {
        getSceneLayout: () => ({
          panelCount: 4,
          panels: [{ view: "iso-ne" }, { view: "iso-se" }, { view: "iso-sw" }, { view: "iso-nw" }]
        })
      },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);

    expect(application.element.querySelectorAll('[data-role="view-select"]')).toHaveLength(4);
    for (const select of application.element.querySelectorAll('[data-role="view-select"]')) {
      expect(select.children.map((option) => option.value)).toEqual([
      "top", "bottom", "left", "right", "front", "back", "isometric"
      ]);
    }
    expect(application.viewerState.panels.map(({ view }) => view)).toEqual([
      "isometric", "isometric", "isometric", "isometric"
    ]);
  });

  it("updates the panel viewport when its observed size changes", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    FakeResizeObserver.instances.at(-1).trigger(420, 250);

    expect(application.getViewportDimensions()).toEqual({ width: 420, height: 250 });
    expect(application.element.querySelector("canvas").width).toBe(420);
    expect(application.element.querySelector("canvas").height).toBe(250);
  });

  it("coalesces invalidations into one render frame and stops when idle", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    let invalidate;
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: {
        subscribe: (listener) => {
          invalidate = listener;
          return () => {};
        }
      },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    invalidate({ type: "token-invalidation" });
    invalidate({ type: "token-invalidation" });

    expect(scheduler).toHaveBeenCalledTimes(2);
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.flush();
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("detaches its synchronization subscriber on close without writing tokens", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const unsubscribe = vi.fn();
    const token = { update: vi.fn() };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [token] },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => unsubscribe },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    await application.close();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(FakeResizeObserver.instances.at(-1).disconnect).toHaveBeenCalledOnce();
    expect(token.update).not.toHaveBeenCalled();
  });

  it("passes only visibility-filtered tactical states to the renderer", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const visibleStates = [{ tokenId: "visible", visibleToCurrentUser: true }];
    const renderer = { render: vi.fn() };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => visibleStates)
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();

    expect(tacticalStateService.getVisibleTacticalStates).toHaveBeenCalledWith(application.scene);
    expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
      visibleTacticalStates: visibleStates
    }));
  });

  it("wires local Pointer Event selection, zoom/reset controls, and the readout", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const projectedToken = {
      tokenId: "visible",
      name: "Aurora",
      point: { x: 100, y: 100 },
      markerRadius: 20,
      visibleToCurrentUser: true
    };
    const renderer = {
      buildModel: vi.fn(() => ({
        view: "top",
        camera: {
          view: "top",
          focus: { x: 5, y: 5, z: 0 },
          scale: 64,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: [projectedToken]
      })),
      render: vi.fn()
    };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => [{
        tokenId: "visible",
        name: "Aurora",
        tacticalX: 2.5,
        tacticalY: 1.5,
        tacticalZ: 0,
        visibleToCurrentUser: true,
        participating: true
      }])
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    const canvas = application.element.querySelector("canvas");
    const readout = application.element.querySelector('[data-role="selected-token-readout"]');
    canvas.dispatchEvent({
      type: "pointerdown",
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    });
    canvas.dispatchEvent({
      type: "pointerup",
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
      preventDefault: vi.fn()
    });

    expect(application.viewerState.selectedTokenId).toBe("visible");
    expect(readout.textContent).toContain("Selected Aurora");
    expect(application.viewerState.panels[0].zoom).toBe(64);
    expect(application.viewerState.panels[0].fitToPanel).toBe(true);
    expect(application.getPanelRenderState(0).zoom).toBeUndefined();

    application.element.querySelector('[data-role="zoom-in"]').dispatchEvent({ type: "click" });
    expect(application.viewerState.panels[0].zoom).toBe(80);
    expect(application.viewerState.panels[0].fitToPanel).toBe(false);
    application.element.querySelector('[data-role="reset-view"]').dispatchEvent({ type: "click" });
    expect(application.viewerState.panels[0].zoom).toBe(64);
    expect(application.viewerState.panels[0].focus).toBeNull();
  });

  it("exposes Top heading +/-45 controls and commits through the update service", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const tokenDocument = {
      id: "ship",
      x: 0,
      y: 0,
      elevation: 15,
      rotation: 180,
      flags: { "tactical-3d-viewer": { pitch: 0 } }
    };
    const tacticalUpdateService = {
      captureInteractionSnapshot: vi.fn(() => ({
        x: 0, y: 0, elevation: 15, rotation: 180, pitch: 0
      })),
      setHeading: vi.fn(async () => ({ status: "accepted", ok: true })),
      setPitch: vi.fn(async () => ({ status: "accepted", ok: true })),
      moveVisibleAxes: vi.fn(async () => ({ status: "accepted", ok: true })),
      moveZ: vi.fn(async () => ({ status: "accepted", ok: true }))
    };
    const renderer = {
      buildModel: vi.fn(() => ({
        view: "top",
        camera: {
          view: "top",
          focus: { x: 0.5, y: 0.5, z: 3 },
          scale: 64,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: [{
          tokenId: "ship",
          point: { x: 200, y: 150 },
          markerRadius: 20,
          visibleToCurrentUser: true,
          canCurrentUserMove: true,
          canCurrentUserRotate: true,
          participating: true
        }]
      })),
      render: vi.fn()
    };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => [{
        tokenId: "ship",
        name: "Aurora",
        tacticalX: 0.5,
        tacticalY: 0.5,
        tacticalZ: 3,
        heading: 3,
        pitch: 0,
        visibleToCurrentUser: true,
        participating: true,
        canCurrentUserMove: true,
        canCurrentUserRotate: true
      }])
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [tokenDocument] },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      tacticalUpdateService,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    application.viewerState.selectedTokenId = "ship";
    application.updateInteractionControls();

    expect(application.element.querySelector('[data-role="heading-decrease"]')).not.toBeNull();
    expect(application.element.querySelector('[data-role="heading-increase"]')).not.toBeNull();
    expect(application.element.querySelector('[data-role="move-right"]').disabled).toBe(false);
    expect(application.element.querySelector('[data-role="z-increase"]').disabled).toBe(false);
    expect(application.element.querySelector('[data-role="pitch-next"]').disabled).toBe(false);
    application.element.querySelector('[data-role="move-right"]').dispatchEvent({ type: "click" });
    application.element.querySelector('[data-role="z-increase"]').dispatchEvent({ type: "click" });
    application.element.querySelector('[data-role="pitch-next"]').dispatchEvent({ type: "click" });
    await application.setHeadingBy(45);

    expect(tacticalUpdateService.captureInteractionSnapshot).toHaveBeenCalledTimes(4);
    expect(tacticalUpdateService.setHeading).toHaveBeenCalledWith(
      tokenDocument,
      45,
      expect.any(Object)
    );
    expect(tacticalUpdateService.setHeading).toHaveBeenCalledOnce();
    expect(tacticalUpdateService.moveVisibleAxes).toHaveBeenCalled();
    expect(tacticalUpdateService.moveZ).toHaveBeenCalled();
    expect(tacticalUpdateService.setPitch).toHaveBeenCalled();
  });

  it("exposes selected token width and height controls and commits a 2x1 footprint", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const tokenDocument = { id: "ship", width: 1, height: 1 };
    const tacticalUpdateService = {
      captureSizeSnapshot: vi.fn(() => ({ width: 1, height: 1 })),
      setSize: vi.fn(async () => ({ status: "accepted", ok: true }))
    };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => [{
        tokenId: "ship",
        width: 1,
        height: 1,
        visibleToCurrentUser: true,
        canCurrentUserUpdate: true
      }])
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [tokenDocument] },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      tacticalUpdateService,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    application.viewerState.selectedTokenId = "ship";
    application.updateInteractionControls();
    const width = application.element.querySelector('[data-role="token-width"]');
    const height = application.element.querySelector('[data-role="token-height"]');

    expect(width).not.toBeNull();
    expect(height).not.toBeNull();
    expect(width.disabled).toBe(false);
    width.value = "2";
    height.value = "1";
    width.dispatchEvent({ type: "change" });

    expect(tacticalUpdateService.captureSizeSnapshot).toHaveBeenCalledWith(tokenDocument);
    expect(tacticalUpdateService.setSize).toHaveBeenCalledWith(
      tokenDocument,
      "2",
      "1",
      { width: 1, height: 1 }
    );
  });

  it("deletes the selected token through the delete control path", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const tokenDocument = { id: "ship", delete: vi.fn(async () => tokenDocument) };
    const tacticalUpdateService = {
      deleteToken: vi.fn(async () => ({ status: "accepted", ok: true, document: tokenDocument }))
    };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => [{
        tokenId: "ship",
        visibleToCurrentUser: true,
        canCurrentUserDelete: true
      }])
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [tokenDocument] },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      tacticalUpdateService,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    application.viewerState.selectedTokenId = "ship";
    application.updateInteractionControls();
    const deleteControl = application.element.querySelector('[data-role="delete-token"]');

    expect(deleteControl.disabled).toBe(false);
    await application.deleteSelectedToken();

    expect(tacticalUpdateService.deleteToken).toHaveBeenCalledWith(tokenDocument);
    expect(application.viewerState.selectedTokenId).toBeNull();
  });

  it("exposes pitch step buttons and commits the selected value", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const tokenDocument = {
      id: "ship",
      x: 0,
      y: 0,
      elevation: 0,
      rotation: 180,
      flags: { "tactical-3d-viewer": { pitch: 0 } }
    };
    const tacticalUpdateService = {
      captureInteractionSnapshot: vi.fn(() => ({
        x: 0, y: 0, elevation: 0, rotation: 180, pitch: 0
      })),
      setPitch: vi.fn(async () => ({ status: "accepted", ok: true }))
    };
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => [{
        tokenId: "ship",
        tacticalX: 0.5,
        tacticalY: 0.5,
        tacticalZ: 0,
        pitch: 0,
        visibleToCurrentUser: true,
        participating: true,
        canCurrentUserMove: true,
        canCurrentUserRotate: true
      }])
    };
    const renderer = {
      buildModel: vi.fn(() => ({
        view: "north",
        camera: {
          view: "north",
          focus: { x: 0.5, y: 0.5, z: 0 },
          scale: 64,
          screenCenter: { x: 200, y: 150 }
        },
        tokens: []
      })),
      render: vi.fn()
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: { ...createScene(), tokens: [tokenDocument] },
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "north" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      tacticalUpdateService,
      renderer,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    scheduler.flush();
    application.viewerState.selectedTokenId = "ship";
    application.updateInteractionControls();

    expect(application.element.querySelector('[data-role="pitch-select"]')).toBeNull();
    const pitchPrevious = application.element.querySelector('[data-role="pitch-previous"]');
    expect(pitchPrevious).not.toBeNull();
    pitchPrevious.dispatchEvent({ type: "click" });

    expect(tacticalUpdateService.setPitch).toHaveBeenCalledWith(
      tokenDocument,
      45,
      expect.any(Object)
    );

    tokenDocument.flags["tactical-3d-viewer"].pitch = 90;
    await application.setPitchBy(-1);
    expect(tacticalUpdateService.setPitch).toHaveBeenCalledWith(
      tokenDocument,
      -90,
      expect.any(Object)
    );
  });

  it("provides a keyboard-selectable overlap chooser with hidden-axis context", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    const handled = application.showOverlapChooser(0, [
      { tokenId: "upper", name: "Upper", visibleToCurrentUser: true,
        hiddenAxisLabel: "Z", hiddenAxisValue: 4 },
      { tokenId: "hidden", name: "Hidden", visibleToCurrentUser: false,
        hiddenAxisLabel: "Z", hiddenAxisValue: 9 },
      { tokenId: "lower", name: "Lower", visibleToCurrentUser: true,
        hiddenAxisLabel: "Z", hiddenAxisValue: 1 }
    ]);

    const chooser = application.element.querySelector('[data-role="overlap-chooser"]');
    const select = application.element.querySelector('[data-role="overlap-chooser-select"]');
    expect(handled).toBe(true);
    expect(chooser.hidden).toBe(false);
    expect(select.tagName).toBe("SELECT");
    expect(select.attributes.get("aria-label")).toBe("Choose visible overlapping token");
    expect(select.children.map((option) => option.textContent)).toEqual([
      "Lower · Z=1", "Upper · Z=4"
    ]);

    select.dispatchEvent({ type: "keydown", key: "Escape", preventDefault: vi.fn() });
    expect(chooser.hidden).toBe(true);
  });

  it("keeps panel controls focusable and named, exposes reduced-motion state, and warns at narrow widths", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 4 }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      document,
      scheduler
    });

    await application.render(true);

    expect(application.element.classList.contains("tactical-viewer-reduced-motion")).toBe(true);
    expect(application.element.dataset.reducedMotion).toBe("true");
    for (const role of [
      "panel-count", "view-select", "zoom-out", "zoom-in", "reset-view", "center-view",
      "move-left", "move-right", "move-up", "move-down", "z-decrease", "z-increase",
      "heading-decrease", "heading-increase", "pitch-previous", "pitch-next",
      "panel-options", "shared-options-button"
    ]) {
      const controls = application.element.querySelectorAll(`[data-role="${role}"]`);
      expect(controls.length).toBeGreaterThan(0);
      controls.forEach((control) => {
        expect(control.attributes.get("aria-label")).toBeTruthy();
      });
    }
    expect(application.element.querySelectorAll("canvas").every((canvas) => canvas.tabIndex === 0))
      .toBe(true);

    application.updateViewport({ width: 320, height: 360 }, 0);
    expect(application.viewerState.responsive).toMatchObject({ narrow: true, columns: 1 });
    expect(application.element.querySelector('[data-role="responsive-warning"]').hidden).toBe(false);
  });

  it("does not put a hidden state into the selected-token accessible summary", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const tacticalStateService = {
      getVisibleTacticalStates: () => [
        { tokenId: "secret", name: "Secret Ship", visibleToCurrentUser: false },
        { tokenId: "visible", name: "Visible Ship", tacticalX: 1, tacticalY: 2,
          tacticalZ: 3, visibleToCurrentUser: true }
      ]
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: { getSceneLayout: () => ({ panelCount: 1 }) },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      document,
      scheduler
    });

    await application.render(true);
    application.viewerState.selectedTokenId = "secret";
    application.updateSelectedTokenReadout();

    expect(application.element.querySelector('[data-role="selected-token-readout"]').textContent)
      .not.toContain("Secret Ship");
  });

  it("persists the bounded layout before close and refreshes selection from current Documents", async () => {
    const scheduler = createScheduler();
    const document = createFakeDocument();
    const saveSceneLayout = vi.fn(async (_sceneId, layout) => layout);
    let currentStates = [{
      tokenId: "ship",
      name: "Aurora",
      tacticalX: 1,
      tacticalY: 2,
      tacticalZ: 3,
      visibleToCurrentUser: true,
      participating: true
    }];
    const tacticalStateService = {
      getVisibleTacticalStates: vi.fn(() => currentStates)
    };
    const Application = createTacticalViewerApplicationClass({ ApplicationV2: FakeApplicationV2 });
    const application = new Application({
      scene: createScene(),
      persistenceService: {
        getSceneLayout: () => ({ panelCount: 1, panels: [{ view: "top" }] }),
        saveSceneLayout
      },
      synchronizationCoordinator: { subscribe: () => () => {} },
      tacticalStateService,
      document,
      scheduler,
      devicePixelRatio: 1
    });

    await application.render(true);
    application.viewerState.selectedTokenId = "ship";
    currentStates = [];
    expect(application.refreshFromDocuments()).toEqual([]);
    expect(application.viewerState.selectedTokenId).toBeNull();

    await application.close();
    expect(saveSceneLayout).toHaveBeenLastCalledWith("scene-1", expect.objectContaining({
      panelCount: 1,
      panels: expect.any(Array)
    }));
  });
});
