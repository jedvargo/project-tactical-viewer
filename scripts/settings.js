import { MODULE_ID } from "./constants.js";

export const SETTING_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: "defaultPanelCount",
    config: Object.freeze({
      name: "Default panel count",
      hint: "The number of Tactical Viewer panels to open by default.",
      scope: "user",
      config: true,
      type: Number,
      default: 1,
      range: Object.freeze({ min: 1, max: 4, step: 1 })
    })
  }),
  Object.freeze({
    key: "linkSelection",
    config: Object.freeze({
      name: "Link selection",
      hint: "Keep tactical selection synchronized across this user's panels.",
      scope: "user",
      config: true,
      type: Boolean,
      default: true
    })
  }),
  Object.freeze({
    key: "linkCenter",
    config: Object.freeze({
      name: "Link center",
      hint: "Keep the logical tactical center synchronized across this user's panels.",
      scope: "user",
      config: true,
      type: Boolean,
      default: true
    })
  }),
  Object.freeze({
    key: "linkZoom",
    config: Object.freeze({
      name: "Link zoom",
      hint: "Keep tactical zoom synchronized across this user's panels.",
      scope: "user",
      config: true,
      type: Boolean,
      default: true
    })
  }),
  Object.freeze({
    key: "renderQuality",
    config: Object.freeze({
      name: "Rendering quality",
      hint: "Choose the client rendering quality used by Tactical Viewer.",
      scope: "client",
      config: true,
      type: String,
      default: "high",
      choices: Object.freeze({ low: "Low", balanced: "Balanced", high: "High" })
    })
  }),
  Object.freeze({
    key: "maxDevicePixelRatio",
    config: Object.freeze({
      name: "Maximum device pixel ratio",
      hint: "Limit client-side backing-store resolution for Tactical Viewer rendering.",
      scope: "client",
      config: true,
      type: Number,
      default: 2,
      range: Object.freeze({ min: 1, max: 3, step: 0.25 })
    })
  })
]);

/** Register only settings owned by this module. */
export function registerSettings(settings) {
  if (!settings || typeof settings.register !== "function") return false;

  for (const { key, config } of SETTING_DEFINITIONS) {
    settings.register(MODULE_ID, key, config);
  }
  return true;
}
