import { MODULE_ID } from "./constants.js";
import { DEFAULT_USER_LAYOUT } from "./persistence/migrations.js";

export const USER_LAYOUT_SETTING_KEY = "userLayout";
export const AUTO_OPEN_SETTING_KEY = "autoOpen";

export const SETTING_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: USER_LAYOUT_SETTING_KEY,
    config: Object.freeze({
      name: "Tactical Viewer layout",
      hint: "User-local panel layout and per-Scene viewer preferences.",
      scope: "user",
      config: false,
      type: Object,
      default: DEFAULT_USER_LAYOUT
    })
  }),
  Object.freeze({
    key: AUTO_OPEN_SETTING_KEY,
    config: Object.freeze({
      name: "Automatically open Tactical Viewer",
      hint: "Open Tactical Viewer when an eligible Scene becomes active.",
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
