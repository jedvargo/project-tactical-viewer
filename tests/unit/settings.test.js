import { describe, expect, it } from "vitest";

import {
  SETTING_DEFINITIONS,
  registerSettings
} from "../../scripts/settings.js";
import { MODULE_ID } from "../../scripts/constants.js";

function makeSettings() {
  const registrations = [];
  return {
    registrations,
    register(namespace, key, config) {
      registrations.push({ namespace, key, config });
    }
  };
}

describe("Foundry setting registration", () => {
  it("registers the required user preferences as user-scoped settings", () => {
    const settings = makeSettings();

    registerSettings(settings);

    const userSettings = settings.registrations.filter(({ config }) => config.scope === "user");
    expect(userSettings.map(({ key }) => key)).toEqual(expect.arrayContaining([
      "defaultPanelCount",
      "linkSelection",
      "linkCenter",
      "linkZoom"
    ]));
    expect(userSettings).toHaveLength(4);
    expect(userSettings.every(({ namespace }) => namespace === MODULE_ID)).toBe(true);
  });

  it("keeps device rendering/performance preferences client-scoped", () => {
    const settings = makeSettings();

    registerSettings(settings);

    const clientSettings = settings.registrations.filter(({ config }) => config.scope === "client");
    expect(clientSettings.length).toBeGreaterThan(0);
    expect(clientSettings.every(({ key, config }) =>
      ["renderQuality", "maxDevicePixelRatio"].includes(key) && config.scope === "client"
    )).toBe(true);
    expect(settings.registrations.some(({ config }) => config.scope === "world")).toBe(false);
  });

  it("exposes immutable registration definitions without per-Scene layout storage", () => {
    expect(Object.isFrozen(SETTING_DEFINITIONS)).toBe(true);
    expect(SETTING_DEFINITIONS.some(({ key }) => key.includes("layout"))).toBe(false);
  });
});
