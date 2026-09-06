import { MODULE_ID, VIEW_DEFINITIONS } from "../constants.js";

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

const VIEW_IDS = new Set(VIEW_DEFINITIONS.map(({ id }) => id));
const MIRROR_PAIRS = Object.freeze({
  north: Object.freeze({ opposite: "south", enabledBy: "northSouth" }),
  south: Object.freeze({ opposite: "north", enabledBy: "northSouth" }),
  east: Object.freeze({ opposite: "west", enabledBy: "eastWest" }),
  west: Object.freeze({ opposite: "east", enabledBy: "eastWest" })
});

function normalizedPreset(preset) {
  const key = typeof preset === "string" ? preset.trim().toLowerCase() : "";
  return PRESET_ALIASES[key] ?? "marker";
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function artConfig(value) {
  const art = isRecord(value) ? value : {};
  return {
    preset: typeof art.preset === "string" && art.preset ? art.preset : "generic-ship",
    icon: typeof art.icon === "string" ? art.icon.trim() : "",
    forwardOffset: typeof art.forwardOffset === "number" && Number.isFinite(art.forwardOffset)
      ? art.forwardOffset
      : 0,
    mirror: isRecord(art.mirror) ? art.mirror : {},
    views: isRecord(art.views) ? art.views : {}
  };
}

function addCandidate(candidates, seen, source, mirrored, level) {
  if (typeof source !== "string" || !source.trim() || seen.has(source)) return;
  seen.add(source);
  candidates.push(Object.freeze({
    source: source.trim(),
    mirrored,
    level
  }));
}

/**
 * Return the contract-defined artwork fallback chain without loading anything.
 * Paths are retained as inert data and are only handed to AssetManager.load().
 */
export function getTacticalArtCandidates(value, view) {
  const art = artConfig(value);
  const candidates = [];
  const seen = new Set();
  const exact = VIEW_IDS.has(view) ? art.views[view] : "";
  addCandidate(candidates, seen, exact, false, "view");

  const mirror = MIRROR_PAIRS[view];
  if (mirror?.enabledBy && art.mirror[mirror.enabledBy] === true) {
    addCandidate(candidates, seen, art.views[mirror.opposite], true, "mirrored-view");
  }

  addCandidate(candidates, seen, art.icon, false, "icon");
  addCandidate(
    candidates,
    seen,
    GENERIC_ASSET_PATHS[normalizedPreset(art.preset)],
    false,
    "preset"
  );
  addCandidate(candidates, seen, GENERIC_ASSET_PATHS.marker, false, "marker");
  return Object.freeze(candidates);
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

  // Module-owned fallback art is relative to the module manifest, while a
  // native Token texture is relative to Foundry's current document URL.
  if (source.startsWith("assets/")) {
    const moduleUrl = globalThis?.game?.modules?.get?.(MODULE_ID)?.url;
    if (typeof moduleUrl === "string" && moduleUrl) {
      return new URL(source, moduleUrl.endsWith("/") ? moduleUrl : `${moduleUrl}/`).href;
    }
  }

  const locationUrl = globalThis?.location?.href;
  if (typeof locationUrl === "string" && locationUrl) return new URL(source, locationUrl).href;
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
    this.failedSources = new Map();
  }

  get cacheSize() {
    return this.cache.size;
  }

  getPresetSource(preset) {
    return GENERIC_ASSET_PATHS[normalizedPreset(preset)];
  }

  getStatus(source) {
    const key = this.#resolvedKey(source);
    if (!key) return typeof source === "string" && source.trim() ? "failed" : "missing";
    return this.cache.get(key)?.state ?? "missing";
  }

  peek(source) {
    const key = this.#resolvedKey(source);
    if (!key) return null;
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

  /**
   * Return the first already-decoded art candidate. A loading higher-priority
   * candidate deliberately blocks lower candidates until its result is known,
   * preserving the documented fallback order across redraws.
   */
  peekArt(art, view) {
    for (const candidate of getTacticalArtCandidates(art, view)) {
      let status;
      try {
        status = this.getStatus(candidate.source);
      } catch {
        status = "failed";
      }
      if (status === "loading") return null;
      if (status !== "ready") continue;
      const value = this.peek(candidate.source);
      if (value) {
        return Object.freeze({
          image: value,
          source: candidate.source,
          mirrored: candidate.mirrored,
          level: candidate.level,
          forwardOffset: artConfig(art).forwardOffset
        });
      }
    }
    return null;
  }

  /**
   * Load candidates in strict order. Individual failures are expected and
   * move resolution to the next level; the generic marker is the final
   * guaranteed tactical image attempt.
   */
  async loadArt(art, view) {
    const configuration = artConfig(art);
    for (const candidate of getTacticalArtCandidates(configuration, view)) {
      let value;
      try {
        value = await this.load(candidate.source);
      } catch {
        value = null;
      }
      if (value) {
        return Object.freeze({
          image: value,
          source: candidate.source,
          mirrored: candidate.mirrored,
          level: candidate.level,
          forwardOffset: configuration.forwardOffset
        });
      }
    }
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
    const rawSource = source.trim();
    if (this.failedSources.has(rawSource)) return Promise.resolve(null);
    const key = this.#resolvedKey(rawSource);
    if (!key) return Promise.resolve(null);
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
    const removed = this.cache.size + this.failedSources.size;
    this.cache.clear();
    this.failedSources.clear();
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

  #resolvedKey(source) {
    if (typeof source !== "string" || !source.trim()) return null;
    const rawSource = source.trim();
    if (this.failedSources.has(rawSource)) return null;
    try {
      return this.#keyFor(rawSource);
    } catch {
      // A resolver failure is a stable session failure. Remember it before
      // fallback selection asks about the same candidate on the next redraw.
      this.failedSources.set(rawSource, true);
      while (this.failedSources.size > this.maxEntries) {
        const oldest = this.failedSources.keys().next().value;
        if (oldest === undefined) break;
        this.failedSources.delete(oldest);
      }
      return null;
    }
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
