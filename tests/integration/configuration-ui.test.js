import { describe, expect, it, vi } from "vitest";

import { createRuntime } from "../../scripts/runtime.js";
import { createFakeFoundryHooks } from "../helpers/fake-foundry.js";

class Element {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.type = "";
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith("data-")) this.dataset[name.slice(5).replaceAll(/-([a-z])/g, (_m, letter) => letter.toUpperCase())] = String(value);
  }
  addEventListener(type, listener) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(listener);
    this.listeners.set(type, callbacks);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = (node) => {
      const role = selector.match(/^\[data-role="([^"]+)"\]$/);
      const name = selector.match(/^\[name="([^"]+)"\]$/);
      if (selector === "form" && node.tagName === "FORM") found.push(node);
      if (role && node.dataset.role === role[1]) found.push(node);
      if (name && node.attributes.get("name") === name[1]) found.push(node);
      node.children.forEach(visit);
    };
    visit(this);
    return found;
  }
}

function documentFactory() {
  const document = { createElement: (tagName) => new Element(tagName, document) };
  return document;
}

function formRoot(document) {
  const root = document.createElement("div");
  const form = document.createElement("form");
  root.append(form);
  return root;
}

describe("configuration UI hook integration", () => {
  it("adds only Scene controls through the ApplicationV2 render hook", () => {
    const hooks = createFakeFoundryHooks();
    const runtime = createRuntime({ hooks });
    runtime.initialize();
    const document = documentFactory();

    const sceneElement = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "SceneConfig" },
      document: {
        documentName: "Scene",
        grid: { type: "square", size: 100, distance: 5 },
        dimensions: { width: 1000, height: 800 },
        getFlag: () => false
      }
    }, sceneElement, {}, {});
    expect(sceneElement.querySelector('[data-role="tactical-scene-config"]')).not.toBeNull();

    const tokenElement = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "TokenConfig" },
      document: { documentName: "Token", flags: {} },
      isPrototype: false
    }, tokenElement, {}, {});
    expect(tokenElement.querySelector('[data-role="tactical-token-config"]')).toBeNull();
    expect(tokenElement.querySelector('[name="flags.tactical-3d-viewer.pitch"]')).toBeNull();

    const prototypeElement = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "PrototypeTokenConfig" },
      isPrototype: true,
      document: { documentName: "Actor" },
      token: { documentName: "PrototypeToken", flags: {} }
    }, prototypeElement, {}, {});
    expect(prototypeElement.querySelector('[data-role="tactical-token-config"]')).toBeNull();
  });

  it("disables Scene enablement and explains an unsupported grid", () => {
    const hooks = createFakeFoundryHooks();
    const runtime = createRuntime({ hooks });
    runtime.initialize();
    const document = documentFactory();
    const root = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "SceneConfig" },
      document: {
        documentName: "Scene",
        grid: { type: "gridless", size: 0, distance: 0 },
        dimensions: { width: 1000, height: 800 },
        getFlag: () => false
      }
    }, root, {}, {});

    const control = root.querySelector('[name="flags.tactical-3d-viewer.enabled"]');
    expect(control.disabled).toBe(true);
    expect(root.querySelector('[data-role="tactical-scene-eligibility"]').textContent)
      .toContain("gridless");
  });

  it("renders Scene enablement through Foundry's typed Boolean input helper", async () => {
    const hooks = createFakeFoundryHooks();
    const document = documentFactory();
    const booleanInput = vi.fn(({ name, value, disabled }) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("name", name);
      input.checked = value;
      input.disabled = disabled;
      return input;
    });
    vi.stubGlobal("foundry", { applications: { fields: { createCheckboxInput: booleanInput } } });

    const runtime = createRuntime({ hooks });
    runtime.initialize();
    let enabled = false;
    const scene = {
      documentName: "Scene",
      grid: { type: "square", size: 100, distance: 5 },
      dimensions: { width: 1000, height: 800 },
      flags: { "tactical-3d-viewer": { enabled }, other: { preserved: true } },
      getFlag: vi.fn((_scope, key) => key === "enabled" ? enabled : 2),
      setFlag: vi.fn(async (_scope, key, value) => {
        if (key === "enabled") {
          enabled = value;
          scene.flags["tactical-3d-viewer"].enabled = value;
        }
        return value;
      })
    };
    await runtime.setSceneEnabled(scene, true);
    const root = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "SceneConfig" },
      document: scene
    }, root, {}, {});

    const control = root.querySelector('[name="flags.tactical-3d-viewer.enabled"]');
    expect(booleanInput).toHaveBeenCalledWith(expect.objectContaining({
      name: "flags.tactical-3d-viewer.enabled",
      value: true
    }));
    expect(control.checked).toBe(true);
    expect(control.disabled).toBe(false);
    vi.unstubAllGlobals();
  });

  it("does not add token participation fields through Foundry's typed Boolean input helper", () => {
    const hooks = createFakeFoundryHooks();
    const document = documentFactory();
    const booleanInput = vi.fn(({ name, value }) => {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("name", name);
      input.checked = value;
      return input;
    });
    vi.stubGlobal("foundry", { applications: { fields: { createCheckboxInput: booleanInput } } });

    const runtime = createRuntime({ hooks });
    runtime.initialize();
    const root = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "TokenConfig" },
      document: {
        documentName: "Token",
        flags: { "tactical-3d-viewer": { enabled: true } }
      }
    }, root, {}, {});

    const control = root.querySelector('[name="flags.tactical-3d-viewer.enabled"]');
    expect(booleanInput).not.toHaveBeenCalled();
    expect(control).toBeNull();

    const prototypeRoot = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "PrototypeTokenConfig" },
      isPrototype: true,
      document: { documentName: "Actor" },
      token: {
        documentName: "PrototypeToken",
        flags: { "tactical-3d-viewer": { enabled: true } }
      }
    }, prototypeRoot, {}, {});
    expect(booleanInput).not.toHaveBeenCalled();
    expect(prototypeRoot.querySelector('[name="flags.tactical-3d-viewer.enabled"]')).toBeNull();
    vi.unstubAllGlobals();
  });

  it("does not render a fallback token checkbox", () => {
    const hooks = createFakeFoundryHooks();
    const runtime = createRuntime({ hooks });
    runtime.initialize();
    const document = documentFactory();
    const root = formRoot(document);
    hooks.fire("renderApplicationV2", {
      constructor: { name: "TokenConfig" },
      document: { documentName: "Token", flags: {} }
    }, root, {}, {});

    expect(root.querySelector('[name="flags.tactical-3d-viewer.enabled"]')).toBeNull();
  });

  it("registers the configuration hook once and invalidates runtime state on flag updates", () => {
    const hooks = createFakeFoundryHooks();
    const frames = [];
    const runtime = createRuntime({ hooks, synchronizationScheduler: (callback) => frames.push(callback) });
    const listener = vi.fn();
    runtime.getService("synchronization").subscribe(listener);
    runtime.initialize();
    runtime.initialize();

    hooks.fire("updateToken", { id: "token-1" }, { flags: { "tactical-3d-viewer": { pitch: 45 } } });
    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ reasons: ["module-flags"] }));
  });

  it("re-reads changed tactical flags immediately after the update hook", () => {
    const hooks = createFakeFoundryHooks();
    const runtime = createRuntime({ hooks });
    runtime.initialize();
    const scene = {
      id: "scene-1",
      grid: {
        type: "square", size: 100, sizeX: 100, sizeY: 100, distance: 5,
        getOffset: ({ x, y }) => ({ i: Math.floor(x / 100), j: Math.floor(y / 100) }),
        getCenterPoint: ({ i, j }) => ({ x: (i + 0.5) * 100, y: (j + 0.5) * 100 }),
        getTopLeftPoint: ({ i, j }) => ({ x: i * 100, y: j * 100 })
      },
      dimensions: { width: 1000, height: 800 }
    };
    const token = {
      id: "token-1", x: 0, y: 0, width: 1, height: 1, elevation: 0, rotation: 180,
      flags: { "tactical-3d-viewer": { enabled: true, pitch: 0, art: {} } },
      getFlag(scope, key) { return this.flags[scope]?.[key]; }
    };
    expect(runtime.getService("tacticalTokenState").build(token, scene).pitch).toBe(0);
    token.flags["tactical-3d-viewer"].pitch = 45;
    hooks.fire("updateToken", token, { flags: { "tactical-3d-viewer": { pitch: 45 } } });
    expect(runtime.getService("tacticalTokenState").build(token, scene).pitch).toBe(45);
  });
});
