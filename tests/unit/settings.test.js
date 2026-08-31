import { describe, expect, it } from "vitest";

import {
  SETTING_DEFINITIONS,
  registerSettings
} from "../../scripts/settings.js";
import { MODULE_ID } from "../../scripts/constants.js";
import { USER_LAYOUT_SETTING_KEY } from "../../scripts/persistence/user-layouts.js";

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
  it("registers the structured user layout as a user-scoped setting", () => {
    const settings = makeSettings();

    registerSettings(settings);

    const userSettings = settings.registrations.filter(({ config }) => config.scope === "user");
    expect(userSettings.map(({ key }) => key)).toEqual([USER_LAYOUT_SETTING_KEY]);
    expect(userSettings).toHaveLength(1);
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
    expect(SETTING_DEFINITIONS.some(({ key }) => key === USER_LAYOUT_SETTING_KEY)).toBe(true);
  });
});
