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
});
