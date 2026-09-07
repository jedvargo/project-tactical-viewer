import { describe, expect, it } from "vitest";

import {
  createViewRegistry,
  VIEW_REGISTRY
} from "../../scripts/view-registry.js";

describe("fixed tactical view registry", () => {
  it("contains exactly the seven declared views in order", () => {
    expect(VIEW_REGISTRY.list()).toEqual([
      { id: "top", name: "Top" },
      { id: "bottom", name: "Bottom" },
      { id: "left", name: "Left" },
      { id: "right", name: "Right" },
      { id: "front", name: "Front" },
      { id: "back", name: "Back" },
      { id: "isometric", name: "Isometric" }
    ]);
    expect(VIEW_REGISTRY.size).toBe(7);
  });

  it("has unique IDs and no public mutators", () => {
    const views = VIEW_REGISTRY.list();
    expect(new Set(views.map(({ id }) => id)).size).toBe(views.length);
    expect(VIEW_REGISTRY.has("tenth-view")).toBe(false);
    expect("add" in VIEW_REGISTRY).toBe(false);
    expect("delete" in VIEW_REGISTRY).toBe(false);
    expect(Object.isFrozen(VIEW_REGISTRY)).toBe(true);
    expect(Object.isFrozen(views)).toBe(true);
    expect(Object.isFrozen(views[0])).toBe(true);
    expect(() => views.push({ id: "tenth-view", name: "Tenth" })).toThrow();
  });

  it("rejects duplicate IDs when a registry is constructed", () => {
    expect(() => createViewRegistry([
      { id: "same", name: "One" },
      { id: "same", name: "Two" }
    ])).toThrow("View IDs must be unique");
  });

  it("returns the registered view by ID", () => {
    expect(VIEW_REGISTRY.get("isometric")).toEqual({
      id: "isometric",
      name: "Isometric"
    });
    expect(VIEW_REGISTRY.get("missing")).toBeUndefined();
  });
});
