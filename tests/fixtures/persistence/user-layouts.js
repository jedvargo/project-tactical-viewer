/** Persistent user-layout shapes used by the module during development. */
export const USER_LAYOUT_FIXTURES = Object.freeze({
  v0: Object.freeze({
    defaultPanelCount: 2,
    linkSelection: false,
    scenes: Object.freeze({
      "scene-v0": Object.freeze({ views: ["top", "north"] })
    })
  }),
  v1: Object.freeze({
    schemaVersion: 1,
    defaultPanelCount: 3,
    linkSelection: false,
    linkCenter: true,
    linkZoom: false,
    scenes: Object.freeze({
      "scene-v1": Object.freeze({
        panelCount: 2,
        views: ["top", "north"],
        splitterProportions: [0.4, 0.6],
        pan: Object.freeze({ x: 12, y: 20 })
      })
    })
  }),
  v2: Object.freeze({
    schemaVersion: 2,
    defaults: Object.freeze({
      panelCount: 1,
      linkSelection: true,
      linkCenter: true,
      linkZoom: true
    }),
    scenes: Object.freeze({
      "scene-v2": Object.freeze({
        panelCount: 1,
        panels: Object.freeze([Object.freeze({ view: "top" })]),
        links: Object.freeze({ selection: true, center: true, zoom: true }),
        splits: Object.freeze([])
      })
    })
  })
});
