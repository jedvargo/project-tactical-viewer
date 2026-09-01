import { DEFAULT_OVERLAYS } from "../persistence/migrations.js";
import { VIEW_DEFINITIONS } from "../constants.js";

export const PANEL_COUNTS = Object.freeze([1, 2, 3, 4]);
export const MIN_PANEL_WIDTH = 180;
export const MIN_PANEL_HEIGHT = 120;
export const DEFAULT_PANEL_VIEWS = Object.freeze(["top", "north", "iso-ne", "west"]);
export const DEFAULT_SPLITTER_PROPORTIONS = Object.freeze([0.5, 0.5]);

const VIEW_IDS = new Set(VIEW_DEFINITIONS.map(({ id }) => id));

export function normalizePanelCount(value, fallback = 1) {
  return PANEL_COUNTS.includes(value) ? value : fallback;
}

export function clampSplitterProportion(value, total, minimum) {
  const numericTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const numericMinimum = Number.isFinite(minimum) && minimum > 0 ? minimum : 0;
  if (numericTotal === 0) return 0.5;
  const minimumRatio = numericMinimum / numericTotal;
  if (minimumRatio >= 0.5) return 0.5;
  const number = Number.isFinite(value) ? value : 0.5;
  return Math.min(1 - minimumRatio, Math.max(minimumRatio, number));
}

function normalizedSplit(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

function panelOverlays(source) {
  return {
    ...DEFAULT_OVERLAYS,
    ...(source && typeof source === "object" ? source : {})
  };
}

/** Normalize persisted layout state while retaining all four panel records. */
export function normalizePanelLayout(source = {}) {
  const panels = Array.isArray(source?.panels) ? source.panels : [];
  const links = source?.links && typeof source.links === "object" ? source.links : {};
  const splits = Array.isArray(source?.splits)
    ? source.splits
    : Array.isArray(source?.splitterProportions)
      ? source.splitterProportions
      : DEFAULT_SPLITTER_PROPORTIONS;

  return {
    panelCount: normalizePanelCount(source?.panelCount),
    panels: DEFAULT_PANEL_VIEWS.map((fallback, index) => {
      const panel = panels[index];
      const view = typeof panel?.view === "string" && VIEW_IDS.has(panel.view)
        ? panel.view
        : (typeof panel === "string" && VIEW_IDS.has(panel) ? panel : fallback);
      return {
        view,
        overlays: panelOverlays(panel?.overlays)
      };
    }),
    splits: [normalizedSplit(splits[0]), normalizedSplit(splits[1])],
    links: {
      selection: links.selection !== false,
      center: links.center !== false,
      zoom: links.zoom !== false
    }
  };
}

/** Return CSS-grid coordinates for the specified default panel arrangement. */
export function defaultPanelAreas(panelCount) {
  const count = normalizePanelCount(panelCount);
  if (count === 1) return [{ column: 1, row: 1, columnSpan: 1, rowSpan: 1 }];
  if (count === 2) return [
    { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
    { column: 2, row: 1, columnSpan: 1, rowSpan: 1 }
  ];
  if (count === 3) return [
    { column: 1, row: 1, columnSpan: 1, rowSpan: 2 },
    { column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
    { column: 2, row: 2, columnSpan: 1, rowSpan: 1 }
  ];
  return [
    { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
    { column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
    { column: 1, row: 2, columnSpan: 1, rowSpan: 1 },
    { column: 2, row: 2, columnSpan: 1, rowSpan: 1 }
  ];
}
