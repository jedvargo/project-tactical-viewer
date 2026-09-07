import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const translations = JSON.parse(readFileSync(
  new URL("../../lang/en.json", import.meta.url),
  "utf8"
));

const requiredKeys = [
  "viewer.title",
  "viewer.panels",
  "viewer.panelCount",
  "viewer.links.selection",
  "viewer.links.center",
  "viewer.links.zoom",
  "viewer.projection",
  "viewer.displayMode.label",
  "viewer.displayMode.window",
  "viewer.displayMode.scene",
  "viewer.displayMode.replace",
  "viewer.zoomIn",
  "viewer.zoomOut",
  "viewer.resetView",
  "viewer.movement.left",
  "viewer.movement.right",
  "viewer.movement.up",
  "viewer.movement.down",
  "viewer.movement.zDown",
  "viewer.movement.zUp",
  "viewer.heading.decrease",
  "viewer.heading.increase",
  "viewer.pitch.previous",
  "viewer.pitch.next",
  "viewer.options",
  "viewer.overlay.grid",
  "viewer.overlay.names",
  "viewer.overlay.elevation",
  "viewer.overlay.heading",
  "viewer.overlay.pitch",
  "viewer.readout.none",
  "viewer.readout.selected",
  "viewer.interaction.readOnly",
  "viewer.interaction.enabled",
  "viewer.interaction.isoDescription",
  "viewer.interaction.orthographicDescription",
  "viewer.interaction.isoTitle",
  "viewer.interaction.orthographicTitle",
  "viewer.overlapChooser",
  "viewer.splitter.columns",
  "viewer.splitter.rows",
  "viewer.responsiveWarning",
  "configuration.title",
  "configuration.scene.enable",
  "configuration.scene.available",
  "configuration.token.participate",
  "configuration.token.genericPreset",
  "configuration.token.customIcon",
  "configuration.token.choose",
  "configuration.token.advancedArt",
  "configuration.art.description",
  "configuration.art.forwardReference",
  "configuration.art.mirrorFrontBack",
  "configuration.art.mirrorLeftRight",
  "configuration.art.save",
  "settings.userLayout.name",
  "settings.userLayout.hint",
  "settings.autoOpen.name",
  "settings.autoOpen.hint",
  "settings.renderQuality.name",
  "settings.renderQuality.hint",
  "settings.renderQuality.low",
  "settings.renderQuality.balanced",
  "settings.renderQuality.high",
  "settings.maxDevicePixelRatio.name",
  "settings.maxDevicePixelRatio.hint",
  "actions.conflict",
  "actions.adjusted",
  "actions.isometricReadOnly",
  "actions.rotationLocked",
  "actions.movementLocked",
  "actions.permission",
  "actions.rejected",
  "sceneEligibility.INVALID_SCENE",
  "sceneEligibility.GRIDLESS",
  "sceneEligibility.HEX_GRID",
  "sceneEligibility.UNSUPPORTED_GRID",
  "sceneEligibility.GRID_SIZE",
  "sceneEligibility.GRID_DISTANCE",
  "sceneEligibility.DIMENSIONS",
  "renderer.hidden",
  "renderer.elevation",
  "renderer.heading",
  "renderer.pitch",
  "renderer.offGrid",
  "renderer.stackCount"
];

function hasPath(source, path) {
  return source[`tactical-3d-viewer.${path}`] !== undefined;
}

describe("English localization", () => {
  it("does not define a flat key alongside nested grid-style labels", () => {
    expect(translations["tactical-3d-viewer.viewer.gridStyle"]).toBeUndefined();
    expect(translations["tactical-3d-viewer.viewer.gridStyle.label"]).toBe("Grid lines");
  });

  it("contains every user-visible release key", () => {
    for (const key of requiredKeys) expect(hasPath(translations, key), key).toBe(true);
  });

  it("contains all fixed view labels", () => {
    expect(Object.fromEntries([
      ["top", translations["tactical-3d-viewer.views.top"]],
      ["bottom", translations["tactical-3d-viewer.views.bottom"]],
      ["left", translations["tactical-3d-viewer.views.left"]],
      ["right", translations["tactical-3d-viewer.views.right"]],
      ["front", translations["tactical-3d-viewer.views.front"]],
      ["back", translations["tactical-3d-viewer.views.back"]],
      ["isometric", translations["tactical-3d-viewer.views.isometric"]]
    ])).toEqual({
      top: "Top", bottom: "Bottom", left: "Left", right: "Right",
      front: "Front", back: "Back", isometric: "Isometric"
    });
  });
});
