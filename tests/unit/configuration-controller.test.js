import { describe, expect, it, vi } from "vitest";

import {
  buildTokenFlagUpdate,
  serializeSceneConfiguration,
  serializeTokenConfiguration,
  writePrototypeTokenConfiguration,
  writeSceneConfiguration,
  writeTokenConfiguration
} from "../../scripts/configuration/configuration-controller.js";
import { MODULE_ID, VIEW_DEFINITIONS } from "../../scripts/constants.js";

function formData(values) {
  return {
    get(name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
    }
  };
}

function fullTokenForm(overrides = {}) {
  return formData({
    [`flags.${MODULE_ID}.enabled`]: "on",
    [`flags.${MODULE_ID}.pitch`]: "45",
    [`flags.${MODULE_ID}.art.preset`]: "generic-object",
    [`flags.${MODULE_ID}.art.icon`]: "icons/ship.webp",
    [`flags.${MODULE_ID}.art.forwardOffset`]: "12",
    [`flags.${MODULE_ID}.art.mirror.northSouth`]: "on",
    [`flags.${MODULE_ID}.art.mirror.eastWest`]: "",
    ...Object.fromEntries(VIEW_DEFINITIONS.map(({ id }) => [
      `flags.${MODULE_ID}.art.views.${id}`,
      id === "top" ? "icons/top.webp" : ""
    ])),
    ...overrides
  });
}

function scene({ grid = { type: "square", size: 100, distance: 5 }, enabled = false } = {}) {
  let value = enabled;
  return {
    id: "scene-1",
    grid,
    dimensions: { width: 1000, height: 800 },
    getFlag: vi.fn(() => value),
    setFlag: vi.fn(async (_scope, _key, next) => {
      value = next;
      return next;
    })
  };
}

function token() {
  return {
    id: "token-1",
    isOwner: true,
    update: vi.fn(async (update) => update)
  };
}

describe("configuration controller", () => {
  it("serializes normal token form fields and handles invalid pitch safely", () => {
    const config = serializeTokenConfiguration(fullTokenForm({
      [`flags.${MODULE_ID}.pitch`]: "not-a-pitch"
    }));

    expect(config).toMatchObject({
      enabled: true,
      pitch: 0,
      art: {
        preset: "generic-object",
        icon: "icons/ship.webp",
        forwardOffset: 12,
        mirror: { northSouth: true, eastWest: false },
        views: { top: "icons/top.webp" }
      }
    });
    expect(Object.keys(config.art.views)).toEqual(VIEW_DEFINITIONS.map(({ id }) => id));
  });

  it("serializes the Scene enable control", () => {
    expect(serializeSceneConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: "on"
    }))).toEqual({ enabled: true });
    expect(serializeSceneConfiguration(formData({}))).toEqual({ enabled: false });
  });

  it("serializes typed BooleanField values as actual booleans", () => {
    expect(serializeSceneConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: true
    }))).toEqual({ enabled: true });
    expect(serializeSceneConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: false
    }))).toEqual({ enabled: false });
    expect(serializeTokenConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: true
    })).enabled).toBe(true);
    expect(serializeTokenConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: false
    })).enabled).toBe(false);
  });

  it("writes Scene flags through the existing Scene flag service and blocks unsupported enablement", async () => {
    const supported = scene();
    await writeSceneConfiguration(supported, formData({
      [`flags.${MODULE_ID}.enabled`]: "on"
    }));
    expect(supported.setFlag).toHaveBeenCalledWith(MODULE_ID, "enabled", true);

    const unsupported = scene({ grid: { type: "hexagonal", size: 100, distance: 5 } });
    const result = await writeSceneConfiguration(unsupported, formData({
      [`flags.${MODULE_ID}.enabled`]: "on"
    }));
    expect(result).toBe(false);
    expect(unsupported.setFlag).not.toHaveBeenCalled();
  });

  it("writes placed and prototype token defaults through one namespaced flag update", async () => {
    const placed = token();
    const prototype = token();
    const config = serializeTokenConfiguration(fullTokenForm());
    const expected = buildTokenFlagUpdate(config);

    await writeTokenConfiguration(placed, config);
    await writePrototypeTokenConfiguration(prototype, config);

    expect(placed.update).toHaveBeenCalledWith(expected);
    expect(prototype.update).toHaveBeenCalledWith(expected);
    expect(expected[`flags.${MODULE_ID}.art`]).toMatchObject({
      preset: "generic-object",
      icon: "icons/ship.webp"
    });
  });

  it.each([
    [true, true],
    [false, false]
  ])("persists placed participation=%s as Boolean %s without replacing unrelated token data", async (enabled, expected) => {
    const flags = {
      [MODULE_ID]: { enabled: !expected, pitch: 45, art: { preset: "generic-object" } },
      unrelated: { preserved: true }
    };
    const placed = {
      ...token(),
      flags,
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      update: vi.fn(async (update) => {
        for (const [path, value] of Object.entries(update)) {
          const parts = path.split(".");
          let target = placed;
          for (const part of parts.slice(0, -1)) target = target[part] ??= {};
          target[parts.at(-1)] = value;
        }
        return placed;
      })
    };

    await writeTokenConfiguration(placed, serializeTokenConfiguration(formData({
      [`flags.${MODULE_ID}.enabled`]: enabled
    })));

    expect(placed.getFlag(MODULE_ID, "enabled")).toBe(expected);
    expect(typeof placed.getFlag(MODULE_ID, "enabled")).toBe("boolean");
    expect(placed.flags.unrelated).toEqual({ preserved: true });
  });
});
