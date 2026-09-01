import { MODULE_ID } from "../constants.js";

/** Module-owned static tactical artwork. These are references, not executable data. */
export const GENERIC_ASSET_PATHS = Object.freeze({
  ship: "assets/generic/ship.svg",
  object: "assets/generic/object.svg",
  creature: "assets/generic/creature.svg",
  marker: "assets/generic/marker.svg"
});

export const GENERIC_PRESETS = Object.freeze([
  "generic-ship",
  "generic-object",
  "generic-creature",
  "generic-marker"
]);

const PRESET_ALIASES = Object.freeze({
  ship: "ship",
  object: "object",
  creature: "creature",
  marker: "marker",
  "generic-ship": "ship",
  "generic-object": "object",
  "generic-creature": "creature",
  "generic-marker": "marker"
});

function normalizedPreset(preset) {
  const key = typeof preset === "string" ? preset.trim().toLowerCase() : "";
  return PRESET_ALIASES[key] ?? "marker";
}

function defaultImageFactory() {
  const ImageConstructor = globalThis?.Image;
  if (typeof ImageConstructor !== "function") {
    throw new Error("This client does not provide a native Image source");
  }
  return new ImageConstructor();
}

function defaultResolvePath(source) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(source)) return source;

  const moduleUrl = globalThis?.game?.modules?.get?.(MODULE_ID)?.url;
  if (typeof moduleUrl === "string" && moduleUrl) {
    return new URL(source, moduleUrl.endsWith("/") ? moduleUrl : `${moduleUrl}/`).href;
  }

  return new URL(`../../${source}`, import.meta.url).href;
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * The only boundary that creates native image sources for tactical artwork.
 * Records resolve to an ImageBitmap/Image-like decoded source or null; callers
 * never need to know whether the browser used Image, a test double, or another
 * documented native source.
 */
export class AssetManager {
  constructor({
    maxEntries = 64,
    imageFactory = defaultImageFactory,
    resolvePath = defaultResolvePath
  } = {}) {
    this.maxEntries = positiveInteger(maxEntries, 64);
    this.imageFactory = imageFactory;
    this.resolvePath = resolvePath;
    this.cache = new Map();
  }

  get cacheSize() {
    return this.cache.size;
  }

  getPresetSource(preset) {
    return GENERIC_ASSET_PATHS[normalizedPreset(preset)];
  }

  getStatus(source) {
    const key = this.#keyFor(source);
    return this.cache.get(key)?.state ?? "missing";
  }

  peek(source) {
    const key = this.#keyFor(source);
    const record = this.cache.get(key);
    if (!record) return null;
    this.#touch(key, record);
    return record.state === "ready" ? record.value : null;
  }

  peekPreset(preset) {
    const selected = normalizedPreset(preset);
    const selectedValue = this.peek(GENERIC_ASSET_PATHS[selected]);
    if (selectedValue) return selectedValue;
    if (selected !== "marker") return this.peek(GENERIC_ASSET_PATHS.marker);
    return null;
  }

  loadPreset(preset) {
    const selected = normalizedPreset(preset);
    const promise = this.load(GENERIC_ASSET_PATHS[selected]).then((value) => {
      if (value || selected === "marker") return value;
      return this.loadPreset("marker");
    });
    return promise;
  }

  load(source) {
    if (typeof source !== "string" || !source.trim()) return Promise.resolve(null);
    const key = this.#keyFor(source);
    const existing = this.cache.get(key);
    if (existing) {
      this.#touch(key, existing);
      return existing.promise;
    }

    let resolveRecord;
    const record = {
      source: key,
      state: "loading",
      value: null,
      error: null,
      promise: new Promise((resolve) => { resolveRecord = resolve; })
    };
    this.cache.set(key, record);
    this.#trim();

    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      record.state = "failed";
      record.error = error instanceof Error ? error : new Error(String(error ?? "Image load failed"));
      resolveRecord(null);
      this.#trim();
    };
    const succeed = async (imageSource) => {
      if (settled) return;
      try {
        if (!imageSource) throw new Error("Image factory returned no source");
        if (typeof imageSource.decode === "function") await imageSource.decode();
        if (settled) return;
        settled = true;
        record.state = "ready";
        record.value = imageSource;
        resolveRecord(imageSource);
      } catch (error) {
        fail(error);
      }
    };

    try {
      const imageSource = this.imageFactory(key);
      if (imageSource && typeof imageSource.then === "function") {
        imageSource.then(succeed, fail);
      } else if (imageSource && typeof imageSource === "object"
        && !("src" in imageSource) && typeof imageSource.decode === "function") {
        // Test doubles and already-decoded native sources can enter through
        // the same boundary without pretending to be HTMLImageElements.
        succeed(imageSource);
      } else {
        imageSource.onload = () => succeed(imageSource);
        imageSource.onerror = (error) => fail(error);
        imageSource.src = key;
        if (imageSource.complete && imageSource.naturalWidth > 0) succeed(imageSource);
      }
    } catch (error) {
      fail(error);
    }

    return record.promise;
  }

  clear() {
    const removed = this.cache.size;
    this.cache.clear();
    return removed;
  }

  dispose() {
    return this.clear();
  }

  #keyFor(source) {
    const resolved = this.resolvePath(source);
    if (typeof resolved !== "string" || !resolved) {
      throw new TypeError("Asset paths must resolve to a non-empty string");
    }
    return resolved;
  }

  #touch(key, record) {
    this.cache.delete(key);
    this.cache.set(key, record);
  }

  #trim() {
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) return;
      this.cache.delete(oldest);
    }
  }
}

export function normalizeGenericPreset(preset) {
  return `generic-${normalizedPreset(preset)}`;
}
