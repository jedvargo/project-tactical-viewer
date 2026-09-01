import { describe, expect, it, vi } from "vitest";

import {
  createTacticalViewerApplicationClass
} from "../../scripts/viewer/tactical-viewer-application.js";
import {
  Canvas2DRendererV1,
  createTopRenderModel
} from "../../scripts/rendering/canvas-renderer.js";
import { CoordinateAdapter } from "../../scripts/model/coordinate-adapter.js";
import { PanelInputController } from "../../scripts/viewer/panel-input-controller.js";
import { createFakeSquareGrid, makeSquareScene } from "../helpers/fake-grid.js";

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.style = { setProperty() {} };
    this.listeners = new Map();
    this.classList = { add() {} };
    this.attributes = new Map();
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.hidden = false;
    this._rect = { left: 0, top: 0, width: 300, height: 200 };
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }

  getBoundingClientRect() { return { ...this._rect }; }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  querySelectorAll(selector) {
    const role = selector.match(/^\[data-role="([^"]+)"\]$/)?.[1];
    const matches = [];
    const visit = (element) => {
      if ((selector === "canvas" && element.tagName === "CANVAS")
        || (role && element.dataset.role === role)) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

function documentFixture() {
  const document = {
    createElement(tagName) {
      const element = new Element(tagName, document);
      if (tagName === "canvas") {
        element.getContext = vi.fn(() => ({ clearRect: vi.fn(), setTransform: vi.fn() }));
      }
      return element;
    }
  };
  return document;
}

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};

  async render() {
    this.element = await this._renderHTML({}, {});
    this.rendered = true;
    await this._onRender({}, {});
    return this;
  }

  async close() {
    await this._preClose({});
    this.rendered = false;
  }
}

function scheduler() {
  const callbacks = [];
  const schedule = vi.fn((callback) => callbacks.push(callback));
  schedule.flush = () => callbacks.splice(0).forEach((callback) => callback());
  return schedule;
}

function panelModel(input) {
  const focus = input.panel.focus ?? { x: 5, y: 5, z: 7 };
  const zoom = input.panel.zoom ?? 50;
  return {
    view: input.panel.view,
    camera: {
      view: input.panel.view,
      focus,
      scale: zoom,
      screenCenter: { x: 150, y: 100 }
    },
    tokens: []
  };
}

async function linkedApplication({ panelViews = ["top", "north", "east"], links } = {}) {
  const frame = scheduler();
  const document = documentFixture();
  const Application = createTacticalViewerApplicationClass({ ApplicationV2 });
  const application = new Application({
    scene: { id: "scene-1", name: "Battlefield" },
    persistenceService: {
      getSceneLayout: () => ({
        panelCount: panelViews.length,
        panels: panelViews.map((view) => ({ view })),
        links
      }),
      saveSceneLayout: vi.fn(async (_sceneId, layout) => layout)
    },
    synchronizationCoordinator: { subscribe: () => () => {} },
    renderer: { buildModel: vi.fn(panelModel), render: vi.fn() },
    tacticalStateService: {
      getVisibleTacticalStates: () => [
        { tokenId: "ship", visibleToCurrentUser: true },
        { tokenId: "scout", visibleToCurrentUser: true }
      ]
    },
    document,
    scheduler: frame,
    devicePixelRatio: 1
  });
  await application.render(true);
  application.state.panels.forEach((panel) => {
    panel.focus = { x: 5, y: 5, z: 7 };
    panel.zoom = 50;
  });
  application.state.sharedFocus = { x: 5, y: 5, z: 7 };
  application.state.sharedZoom = 50;
  return { application, frame, document };
}

function pan(application, index, delta) {
  const controller = application.inputControllers[index];
  controller.panBy(delta);
}

describe("Prompt 20 linked viewer state", () => {
  it("links selection across panels and preserves independent selections when unlinked", async () => {
    const { application } = await linkedApplication();

    application.handleSelectionChanged("ship", 1);
    expect(application.state.panels.slice(0, 3).map(({ selectedTokenId }) => selectedTokenId))
      .toEqual(["ship", "ship", "ship"]);

    await application.setLinkSelection(false);
    application.handleSelectionChanged("scout", 1);
    expect(application.state.panels.slice(0, 3).map(({ selectedTokenId }) => selectedTokenId))
      .toEqual(["ship", "scout", "ship"]);
    expect(application.state.selectedTokenId).toBe("ship");
  });

  it.each([
    ["top", { x: 4, y: 5.4, z: 7 }, "z"],
    ["north", { x: 4, y: 5, z: 7.4 }, "y"],
    ["south", { x: 6, y: 5, z: 6.6 }, "y"],
    ["east", { x: 5, y: 4, z: 6.6 }, "x"],
    ["west", { x: 5, y: 6, z: 6.6 }, "x"]
  ])("linked %s panning changes visible axes and preserves %s", async (view, expected) => {
    const { application } = await linkedApplication({ panelViews: [view, "top"] });

    pan(application, 0, { x: 50, y: 20 });

    expect(application.state.sharedFocus).toEqual(expected);
    expect(application.state.panels[0].focus).toEqual(expected);
    expect(application.state.panels[1].focus).toEqual(expected);
  });

  it("keeps focus independent when Link Center is disabled", async () => {
    const { application } = await linkedApplication({ links: { center: false } });

    pan(application, 0, { x: 50, y: 20 });

    expect(application.state.panels[0].focus).toEqual({ x: 4, y: 5.4, z: 7 });
    expect(application.state.panels[1].focus).toEqual({ x: 5, y: 5, z: 7 });
    expect(application.state.sharedFocus).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("links logical pixels-per-cell zoom and keeps unlinked panel zoom independent", async () => {
    const { application } = await linkedApplication();

    application.inputControllers[0].setZoom(100);
    expect(application.state.panels.slice(0, 3).map(({ zoom }) => zoom)).toEqual([100, 100, 100]);

    await application.setLinkZoom(false);
    application.inputControllers[1].setZoom(200);
    expect(application.state.panels.slice(0, 3).map(({ zoom }) => zoom)).toEqual([100, 200, 100]);
  });

  it("links isometric screen-space center and logical zoom without changing 3D focus", async () => {
    const { application } = await linkedApplication({ panelViews: ["iso-ne", "iso-sw"] });

    pan(application, 0, { x: 30, y: -15 });
    application.inputControllers[0].setZoom(120);

    expect(application.state.sharedPan).toEqual({ x: 30, y: -15 });
    expect(application.state.panels.slice(0, 2).map(({ pan }) => pan)).toEqual([
      { x: 30, y: -15 }, { x: 30, y: -15 }
    ]);
    expect(application.state.panels.slice(0, 2).map(({ zoom }) => zoom)).toEqual([120, 120]);
    expect(application.state.sharedFocus).toEqual({ x: 5, y: 5, z: 7 });
  });

  it("persists the three link toggles without persisting transient focus or zoom", async () => {
    const { application } = await linkedApplication();

    await application.setLinkSelection(false);
    await application.setLinkCenter(false);
    await application.setLinkZoom(false);
    const saved = application.persistenceService.saveSceneLayout.mock.calls.at(-1)[1];

    expect(saved.links).toEqual({ selection: false, center: false, zoom: false });
    expect(saved.panels.every((panel) => !Object.hasOwn(panel, "focus")
      && !Object.hasOwn(panel, "zoom"))).toBe(true);
  });

  it("uses the same logical cell scale in differently sized panels", () => {
    const scene = makeSquareScene(createFakeSquareGrid({ size: 100, distance: 5 }));
    const options = {
      scene,
      coordinateAdapter: new CoordinateAdapter(),
      tacticalStates: [],
      zoom: 100,
      focus: { x: 2, y: 2, z: 0 }
    };
    const small = createTopRenderModel({ ...options, viewport: { width: 200, height: 150 } });
    const large = createTopRenderModel({ ...options, viewport: { width: 800, height: 600 } });

    expect(small.camera.scale).toBe(100);
    expect(large.camera.scale).toBe(100);
    expect(large.camera.scale).toBe(small.camera.scale);
  });

  it("does not write game state while linking, panning, zooming, or rendering", async () => {
    const token = { id: "ship", update: vi.fn() };
    const { application } = await linkedApplication();
    application.scene.tokens = [token];

    application.handleSelectionChanged("ship", 0);
    pan(application, 0, { x: 50, y: 20 });
    application.inputControllers[0].setZoom(100);
    application.renderViewport();

    expect(token.update).not.toHaveBeenCalled();
  });
});

describe("Prompt 20 controller integration seam", () => {
  it("keeps link callbacks in view state rather than TokenDocuments", () => {
    const element = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const onSelectionChanged = vi.fn();
    const controller = new PanelInputController({
      element,
      panel: { view: "top", zoom: 50, focus: { x: 1, y: 1, z: 1 } },
      onSelectionChanged,
      getRenderModel: () => ({
        view: "top",
        camera: { view: "top", focus: { x: 1, y: 1, z: 1 }, scale: 50, screenCenter: { x: 0, y: 0 } },
        tokens: []
      })
    });

    controller.selectAt({ x: 20, y: 20 });

    expect(onSelectionChanged).toHaveBeenCalledWith(null, null);
  });
});
