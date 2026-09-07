import {
  canonicalViewId,
  MODULE_ID,
  VIEW_DEFINITIONS,
  VIEW_ID_ALIASES
} from "../constants.js";
import { debugTokenUsage } from "../debug.js";

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

export const AUTOMATIC_ART_EXTENSIONS = Object.freeze([
  "webp",
  "png",
  "svg",
  "gif"
]);

export const AUTOMATIC_ART_VIEW_LABELS = Object.freeze({
  top: "top",
  bottom: "bottom",
  left: "left",
  right: "right",
  front: "front",
  back: "back",
  isometric: "isometric"
});

/** Default module-owned directory for actor-name-based ship artwork. */
export const SHIP_ART_DIRECTORY = "assets/ships";

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
  front: Object.freeze({ opposite: "back", enabledBy: "northSouth" }),
  back: Object.freeze({ opposite: "front", enabledBy: "northSouth" }),
  right: Object.freeze({ opposite: "left", enabledBy: "eastWest" }),
  left: Object.freeze({ opposite: "right", enabledBy: "eastWest" })
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
    actorName: typeof art.actorName === "string" ? art.actorName.trim() : "",
    directory: typeof art.directory === "string" ? art.directory.trim() : "",
    textureSource: typeof art.textureSource === "string" ? art.textureSource.trim() : "",
    actorTextureSource: typeof art.actorTextureSource === "string" ? art.actorTextureSource.trim() : "",
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

function automaticArtFilenamePart(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
      .replace(/[\\/]/g, "-")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
    : "";
}

function directoryOf(source) {
  if (typeof source !== "string") return "";
  const value = source.trim();
  const separator = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return separator >= 0 ? value.slice(0, separator) : "";
}

function joinPath(directory, filename) {
  const base = typeof directory === "string" ? directory.trim().replace(/[\\/]+$/, "") : "";
  return base ? `${base}/${filename}` : filename;
}

/** Return actor-name-based sibling image paths for the requested view. */
export function getAutomaticTacticalArtCandidates(value, view) {
  const art = artConfig(value);
  const canonical = canonicalViewId(view);
  const label = AUTOMATIC_ART_VIEW_LABELS[canonical];
  const actorName = automaticArtFilenamePart(art.actorName);
  if (!label || !actorName) return Object.freeze([]);

  const directories = normalizedPreset(art.preset) === "ship"
    ? [art.directory || SHIP_ART_DIRECTORY]
    : [...new Set([
      art.directory,
      directoryOf(art.textureSource),
      directoryOf(art.actorTextureSource)
    ].filter((directory) => directory !== ""))];
  if (directories.length === 0) directories.push("");
  return Object.freeze(directories.flatMap((directory) =>
    AUTOMATIC_ART_EXTENSIONS.map((extension) => Object.freeze({
      source: joinPath(directory, `${actorName}-${label}.${extension}`),
      mirrored: false,
      level: "automatic-view"
    }))
  ));
}

/**
 * Return the contract-defined artwork fallback chain without loading anything.
 * Paths are retained as inert data and are only handed to AssetManager.load().
 */
export function getTacticalArtCandidates(value, view) {
  const art = artConfig(value);
  const candidates = [];
  const legacyView = Object.hasOwn(VIEW_ID_ALIASES, view);
  const seen = new Set();
  if (legacyView) {
    addCandidate(candidates, seen, art.views[view], false, "view");
    const legacyMirror = {
      north: { opposite: "south", enabledBy: "northSouth" },
      south: { opposite: "north", enabledBy: "northSouth" },
      east: { opposite: "west", enabledBy: "eastWest" },
      west: { opposite: "east", enabledBy: "eastWest" }
    }[view];
    if (legacyMirror?.enabledBy && art.mirror[legacyMirror.enabledBy] === true) {
      addCandidate(
        candidates,
        seen,
        art.views[legacyMirror.opposite],
        true,
        "mirrored-view"
      );
    }
  }
  const canonical = canonicalViewId(view);
  const exact = legacyView ? "" : VIEW_IDS.has(canonical) ? art.views[canonical] : "";
  addCandidate(candidates, seen, exact, false, "view");

  // Read art saved with the former compass/diagonal IDs after the view
  // vocabulary was reduced to the seven canonical views.
  if (!legacyView) for (const [legacy, target] of Object.entries(VIEW_ID_ALIASES)) {
    if (target === canonical) addCandidate(candidates, seen, art.views[legacy], false, "legacy-view");
  }

  const mirror = MIRROR_PAIRS[canonical];
  if (mirror?.enabledBy && art.mirror[mirror.enabledBy] === true) {
    addCandidate(candidates, seen, art.views[mirror.opposite], true, "mirrored-view");
  }

  for (const candidate of getAutomaticTacticalArtCandidates(art, view)) {
    addCandidate(candidates, seen, candidate.source, candidate.mirrored, candidate.level);
  }
  addCandidate(candidates, seen, art.icon, false, "icon");
  addCandidate(candidates, seen, art.textureSource, false, "texture");
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

  // Module-owned fallback art is relative to the module manifest. User-data
  // artwork such as assets/ships/ is served from Foundry's Data root and
  // must instead resolve relative to the current Foundry URL.
  if (source.startsWith("assets/generic/")) {
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
          forwardOffset: candidate.level === "texture" ? 0 : artConfig(art).forwardOffset
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
    const candidates = getTacticalArtCandidates(configuration, view);
    debugTokenUsage("art-resolution-start", {
      view,
      actorName: configuration.actorName,
      textureSource: configuration.textureSource,
      actorTextureSource: configuration.actorTextureSource,
      candidates: candidates.map(({ source, level, mirrored }) => ({ source, level, mirrored }))
    });
    for (const candidate of candidates) {
      let value;
      try {
        value = await this.load(candidate.source);
      } catch (error) {
        debugTokenUsage("art-candidate-error", {
          view,
          source: candidate.source,
          level: candidate.level,
          error: error?.message ?? String(error)
        });
        value = null;
      }
      if (value) {
        debugTokenUsage("art-selected", {
          view,
          source: candidate.source,
          level: candidate.level,
          mirrored: candidate.mirrored
        });
        return Object.freeze({
          image: value,
          source: candidate.source,
          mirrored: candidate.mirrored,
          level: candidate.level,
          forwardOffset: candidate.level === "texture" ? 0 : configuration.forwardOffset
        });
      }
      debugTokenUsage("art-candidate-miss", {
        view,
        source: candidate.source,
        level: candidate.level,
        status: this.getStatus(candidate.source)
      });
    }
    debugTokenUsage("art-resolution-failed", { view });
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
