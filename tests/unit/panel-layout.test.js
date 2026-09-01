import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANEL_VIEWS,
  PANEL_COUNTS,
  clampSplitterProportion,
  defaultPanelAreas,
  normalizePanelLayout
} from "../../scripts/viewer/panel-layout.js";

describe("multi-panel layout model", () => {
  it("supports exactly one through four panels and preserves four panel records", () => {
    expect(PANEL_COUNTS).toEqual([1, 2, 3, 4]);

    const layout = normalizePanelLayout({
      panelCount: 2,
      panels: [{ view: "east" }, { view: "east" }, { view: "west" }, { view: "north" }]
    });

    expect(layout.panelCount).toBe(2);
    expect(layout.panels).toHaveLength(4);
    expect(layout.panels.map(({ view }) => view)).toEqual([
      "east", "east", "west", "north"
    ]);
  });

  it("describes the specified default geometries", () => {
    expect(defaultPanelAreas(1)).toEqual([
      { column: 1, row: 1, columnSpan: 1, rowSpan: 1 }
    ]);
    expect(defaultPanelAreas(2)).toEqual([
      { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
      { column: 2, row: 1, columnSpan: 1, rowSpan: 1 }
    ]);
    expect(defaultPanelAreas(3)).toEqual([
      { column: 1, row: 1, columnSpan: 1, rowSpan: 2 },
      { column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
      { column: 2, row: 2, columnSpan: 1, rowSpan: 1 }
    ]);
    expect(defaultPanelAreas(4)).toEqual([
      { column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
      { column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
      { column: 1, row: 2, columnSpan: 1, rowSpan: 1 },
      { column: 2, row: 2, columnSpan: 1, rowSpan: 1 }
    ]);
  });

  it("uses safe defaults and clamps splitters to minimum panel dimensions", () => {
    const layout = normalizePanelLayout({});
    expect(layout.panels.map(({ view }) => view)).toEqual(DEFAULT_PANEL_VIEWS);
    expect(layout.splits).toEqual([0.5, 0.5]);
    expect(clampSplitterProportion(0.01, 1000, 200)).toBe(0.2);
    expect(clampSplitterProportion(0.99, 1000, 200)).toBe(0.8);
    expect(clampSplitterProportion(0.1, 300, 200)).toBe(0.5);
  });
});
