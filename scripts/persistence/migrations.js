import {
  canonicalViewId,
  CURRENT_SCHEMA_VERSION,
  VIEW_DEFINITIONS
} from "../constants.js";

export const CURRENT_LAYOUT_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;

// The specification recommends retaining 25–50 layouts. Keep the bound
// explicit so storage cannot grow with the number of Scenes ever visited.
export const MAX_SCENE_LAYOUTS = 32;

export const DEFAULT_GRID_OPACITY = 1;
export const DEFAULT_GRID_STYLE = "solid";
export const GRID_LINE_STYLES = Object.freeze(["solid", "dashes", "dots"]);
export const DEFAULT_BACKGROUND = Object.freeze({ color: "#111820", image: "" });

export const DEFAULT_OVERLAYS = Object.freeze({
  grid: true,
  names: true,
  elevation: true,
  heading: true,
  pitch: true,
  coordinates: true,
  debugAxes: false,
  gridOpacity: DEFAULT_GRID_OPACITY,
  gridStyle: DEFAULT_GRID_STYLE
});

export const DEFAULT_DISPLAY_MODE = "window";
export const DISPLAY_MODES = Object.freeze(["window", "scene", "replace"]);

const DEFAULT_PANEL_VIEWS = Object.freeze(["top", "front", "isometric", "left"]);
const VIEW_IDS = new Set(VIEW_DEFINITIONS.map(({ id }) => id));
const TRANSIENT_KEYS = new Set(["pan", "panZoom", "center", "focus", "zoom", "scale"]);
const LEGACY_ROOT_KEYS = new Set([
  "schemaVersion",
  "defaults",
  "scenes",
  "defaultPanelCount",
  "linkSelection",
  "linkCenter",
  "linkZoom"
]);
const LEGACY_SCENE_KEYS = new Set([
  "schemaVersion",
  "panelCount",
  "panels",
  "views",
  "splitterProportions",
  "splits",
  "links",
  "linkSelection",
  "linkCenter",
  "linkZoom",
  "overlays",
  ...TRANSIENT_KEYS
]);

export const DEFAULT_USER_LAYOUT = Object.freeze({
  schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
  defaults: Object.freeze({
    panelCount: 1,
    linkSelection: true,
    linkCenter: true,
    linkZoom: true
  }),
  scenes: Object.freeze({})
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }
  return value;
}

function copyUnknown(source, knownKeys) {
  if (!isRecord(source)) return {};
  return Object.fromEntries(Object.entries(source)
    .filter(([key]) => !knownKeys.has(key))
    .map(([key, value]) => [key, cloneValue(value)]));
}

function normalizedPanelCount(value, fallback = 1) {
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : fallback;
}

function normalizedBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeGridOpacity(value, fallback = DEFAULT_GRID_OPACITY) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

export function normalizeGridStyle(value, fallback = DEFAULT_GRID_STYLE) {
  return GRID_LINE_STYLES.includes(value) ? value : fallback;
}

export function normalizeGridDimensions(value) {
  if (!isRecord(value)) return null;
  const columns = Number(value.x ?? value.columns);
  const rows = Number(value.y ?? value.rows);
  const depth = Number(value.z ?? value.depth ?? 10);
  if (!Number.isInteger(columns) || columns < 1 || columns > 200
    || !Number.isInteger(rows) || rows < 1 || rows > 200
    || !Number.isInteger(depth) || depth < 1 || depth > 200) return null;
  const normalized = { x: columns, y: rows, z: depth };
  Object.defineProperties(normalized, {
    columns: { value: columns, enumerable: false },
    rows: { value: rows, enumerable: false }
  });
  return normalized;
}

export function normalizeBackground(value) {
  const source = isRecord(value) ? value : {};
  const color = typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color)
    ? source.color
    : DEFAULT_BACKGROUND.color;
  const image = typeof source.image === "string" ? source.image.trim() : "";
  return { color, image };
}

export function normalizeDisplayMode(value, fallback = DEFAULT_DISPLAY_MODE) {
  return DISPLAY_MODES.includes(value) ? value : fallback;
}

function normalizedView(value, fallback) {
  const canonical = canonicalViewId(value);
  return typeof canonical === "string" && VIEW_IDS.has(canonical) ? canonical : fallback;
}

function normalizedLastUsed(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizedSplits(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((split) => typeof split === "number" && Number.isFinite(split))
    .map((split) => Math.min(1, Math.max(0, split)));
}

function normalizedOverlays(value) {
  const source = isRecord(value) ? value : {};
  return {
    ...copyUnknown(source, new Set(Object.keys(DEFAULT_OVERLAYS))),
    ...DEFAULT_OVERLAYS,
    ...Object.fromEntries(Object.entries(DEFAULT_OVERLAYS)
      .filter(([key]) => typeof source[key] === "boolean")
      .map(([key]) => [key, source[key]])),
    gridOpacity: normalizeGridOpacity(source.gridOpacity),
    gridStyle: normalizeGridStyle(source.gridStyle)
  };
}

export { normalizedOverlays };

function normalizedDefaults(source) {
  const defaults = isRecord(source?.defaults) ? source.defaults : {};
  return {
    ...copyUnknown(defaults, new Set([
      "panelCount",
      "linkSelection",
      "linkCenter",
      "linkZoom"
    ])),
    panelCount: normalizedPanelCount(
      defaults.panelCount ?? source?.defaultPanelCount,
      DEFAULT_USER_LAYOUT.defaults.panelCount
    ),
    linkSelection: normalizedBoolean(
      defaults.linkSelection ?? source?.linkSelection,
      DEFAULT_USER_LAYOUT.defaults.linkSelection
    ),
    linkCenter: normalizedBoolean(
      defaults.linkCenter ?? source?.linkCenter,
      DEFAULT_USER_LAYOUT.defaults.linkCenter
    ),
    linkZoom: normalizedBoolean(
      defaults.linkZoom ?? source?.linkZoom,
      DEFAULT_USER_LAYOUT.defaults.linkZoom
    )
  };
}

function rawPanels(source) {
  if (Array.isArray(source?.panels)) return source.panels;
  if (Array.isArray(source?.views)) return source.views;
  if (source && ("panels" in source || "views" in source)) return null;
  return [];
}

function normalizedPanels(source) {
  const panels = rawPanels(source);
  if (panels === null) return null;

  return DEFAULT_PANEL_VIEWS.map((defaultView, index) => {
    const panel = panels[index];
    const panelView = typeof panel === "string" ? panel : panel?.view;
    const panelUnknown = isRecord(panel) ? copyUnknown(panel, new Set(["view", ...TRANSIENT_KEYS])) : {};
    return {
      ...panelUnknown,
      view: normalizedView(panelView, defaultView)
    };
  });
}

function normalizedLinks(source, defaults) {
  const links = isRecord(source?.links) ? source.links : {};
  return {
    ...copyUnknown(links, new Set(["selection", "center", "zoom"])),
    selection: normalizedBoolean(
      links.selection ?? source?.linkSelection,
      defaults.linkSelection
    ),
    center: normalizedBoolean(
      links.center ?? source?.linkCenter,
      defaults.linkCenter
    ),
    zoom: normalizedBoolean(
      links.zoom ?? source?.linkZoom,
      defaults.linkZoom
    )
  };
}

function normalizeSceneLayout(source, defaults) {
  if (!isRecord(source)) return null;
  const panels = normalizedPanels(source);
  if (panels === null) return null;

  const panelCount = normalizedPanelCount(source.panelCount, defaults.panelCount);
  const splits = normalizedSplits(source.splits ?? source.splitterProportions);
  const knownKeys = new Set(LEGACY_SCENE_KEYS);

  return {
    ...copyUnknown(source, knownKeys),
    lastUsed: normalizedLastUsed(source.lastUsed),
    panelCount,
    links: normalizedLinks(source, defaults),
    panels,
    splits,
    overlays: normalizedOverlays(source.overlays),
    gridDimensions: normalizeGridDimensions(source.gridDimensions),
    background: normalizeBackground(source.background),
    displayMode: normalizeDisplayMode(source.displayMode)
  };
}

function sceneEntries(source, defaults) {
  if (!isRecord(source?.scenes)) return [];
  return Object.entries(source.scenes)
    .map(([sceneId, scene]) => [sceneId, normalizeSceneLayout(scene, defaults)])
    .filter(([, scene]) => scene !== null);
}

/**
 * Purely normalize/migrate the serializable user layout setting.
 * Invalid individual Scene entries are ignored; valid entries remain usable.
 */
export function migrateUserLayout(input) {
  const source = isRecord(input) ? input : {};
  const defaults = normalizedDefaults(source);
  const migrated = {
    ...copyUnknown(source, LEGACY_ROOT_KEYS),
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    defaults,
    scenes: Object.fromEntries(sceneEntries(source, defaults))
  };

  migrated.scenes = pruneSceneLayouts(migrated.scenes);
  return migrated;
}

/** Pure LRU pruning. Ties are deterministic by Scene ID. */
export function pruneSceneLayouts(scenes, maxEntries = MAX_SCENE_LAYOUTS) {
  if (!isRecord(scenes)) return {};
  const limit = Number.isInteger(maxEntries) && maxEntries >= 0
    ? maxEntries
    : MAX_SCENE_LAYOUTS;
  const retained = Object.entries(scenes)
    .sort(([leftId, left], [rightId, right]) => {
      const usedDifference = normalizedLastUsed(right?.lastUsed)
        - normalizedLastUsed(left?.lastUsed);
      return usedDifference || leftId.localeCompare(rightId);
    })
    .slice(0, limit);
  return Object.fromEntries(retained.map(([sceneId, layout]) => [sceneId, cloneValue(layout)]));
}

export function defaultSceneLayout(defaults = DEFAULT_USER_LAYOUT.defaults) {
  const normalized = normalizedDefaults({ defaults });
  return normalizeSceneLayout({
    panelCount: normalized.panelCount,
    links: {
      selection: normalized.linkSelection,
      center: normalized.linkCenter,
      zoom: normalized.linkZoom
    },
    displayMode: DEFAULT_DISPLAY_MODE
  }, normalized);
}

export function cloneLayout(value) {
  return cloneValue(value);
}
