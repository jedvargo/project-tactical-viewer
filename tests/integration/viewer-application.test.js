import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTacticalViewerApplicationClass
} from "../../scripts/viewer/tactical-viewer-application.js";

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
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
    this.element = null;
    this.rendered = false;
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

  it("constructs a one-panel ApplicationV2 shell from persisted preferences", async () => {
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

    expect(application.state.panelCount).toBe(1);
    expect(application.state.panels).toHaveLength(1);
    expect(application.state.panels[0].view).toBe("north");
    expect(persistenceService.getSceneLayout).toHaveBeenCalledWith("scene-1");

    await application.render(true);

    expect(application.element.querySelectorAll("canvas")).toHaveLength(1);
    expect(application.element.querySelector('[data-role="panel-toolbar"]')).not.toBeNull();
    expect(synchronizationCoordinator.subscribe).toHaveBeenCalledOnce();
    expect(scheduler.pendingCount()).toBe(1);
  });

  it("offers every renderable orthographic view and does not present deferred isometrics as active", async () => {
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
      "top", "north", "south", "east", "west"
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

    expect(application.state.selectedTokenId).toBe("visible");
    expect(readout.textContent).toContain("Selected Aurora");
    expect(application.state.panels[0].zoom).toBe(64);

    application.element.querySelector('[data-role="zoom-in"]').dispatchEvent({ type: "click" });
    expect(application.state.panels[0].zoom).toBe(80);
    application.element.querySelector('[data-role="reset-view"]').dispatchEvent({ type: "click" });
    expect(application.state.panels[0].zoom).toBe(64);
    expect(application.state.panels[0].focus).toBeNull();
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
      setHeading: vi.fn(async () => ({ status: "accepted", ok: true }))
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
        heading: 0,
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
    application.state.selectedTokenId = "ship";
    application.updateInteractionControls();

    expect(application.element.querySelector('[data-role="heading-decrease"]')).not.toBeNull();
    expect(application.element.querySelector('[data-role="heading-increase"]')).not.toBeNull();
    await application.setHeadingBy(45);

    expect(tacticalUpdateService.captureInteractionSnapshot).toHaveBeenCalledOnce();
    expect(tacticalUpdateService.setHeading).toHaveBeenCalledWith(
      tokenDocument,
      45,
      expect.any(Object)
    );
    expect(tacticalUpdateService.setHeading).toHaveBeenCalledOnce();
  });

  it("exposes all five North pitch values and commits the selected value", async () => {
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
    application.state.selectedTokenId = "ship";
    application.updateInteractionControls();

    const pitchSelect = application.element.querySelector('[data-role="pitch-select"]');
    expect(pitchSelect).not.toBeNull();
    expect(pitchSelect.children.map((option) => Number(option.value))).toEqual([
      90, 45, 0, -45, -90
    ]);
    pitchSelect.value = "-90";
    pitchSelect.dispatchEvent({ type: "change" });

    expect(tacticalUpdateService.setPitch).toHaveBeenCalledWith(
      tokenDocument,
      -90,
      expect.any(Object)
    );
  });
});
