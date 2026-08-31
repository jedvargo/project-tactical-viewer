import { VIEW_DEFINITIONS } from "./constants.js";

/**
 * Build a read-only registry from a finite set of view definitions.
 * Duplicate IDs are rejected at construction, and the returned registry has
 * no mutation surface for consumers.
 */
export function createViewRegistry(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new TypeError("A view registry requires at least one definition");
  }

  const views = definitions.map((definition) => {
    if (!definition || typeof definition.id !== "string" || !definition.id) {
      throw new TypeError("Every view definition requires a non-empty ID");
    }
    if (typeof definition.name !== "string" || !definition.name) {
      throw new TypeError(`View ${definition.id} requires a non-empty name`);
    }
    return Object.freeze({ id: definition.id, name: definition.name });
  });

  const ids = new Set(views.map(({ id }) => id));
  if (ids.size !== views.length) {
    throw new TypeError("View IDs must be unique");
  }

  const byId = new Map(views.map((view) => [view.id, view]));
  const list = () => Object.freeze(views.slice());
  const get = (id) => byId.get(id);
  const has = (id) => byId.has(id);

  return Object.freeze({
    get,
    has,
    list,
    size: views.length
  });
}

export const VIEW_REGISTRY = createViewRegistry(VIEW_DEFINITIONS);
