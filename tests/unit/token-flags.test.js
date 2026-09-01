import { describe, expect, it } from "vitest";

import {
  getTacticalTokenFlags,
  getTokenArt,
  getTokenParticipation,
  getTokenPitch,
  getTokenSchemaVersion
} from "../../scripts/model/token-flags.js";
import {
  CURRENT_SCHEMA_VERSION,
  MODULE_ID,
  VIEW_DEFINITIONS
} from "../../scripts/constants.js";

function tokenWithFlags(flags) {
  return {
    id: "token",
    flags,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
}

describe("tactical token flag access", () => {
  it("reads participation from the module namespace and defaults it off", () => {
    expect(getTokenParticipation(tokenWithFlags({}))).toBe(false);
    expect(getTokenParticipation(tokenWithFlags({
      [MODULE_ID]: { enabled: true }
    }))).toBe(true);
    expect(getTokenParticipation(tokenWithFlags({
      [MODULE_ID]: { enabled: false }
    }))).toBe(false);
  });

  it("provides safe pitch, art, and current schema defaults", () => {
    const flags = getTacticalTokenFlags(tokenWithFlags({}));

    expect(getTokenPitch(tokenWithFlags({}))).toBe(0);
    expect(getTokenSchemaVersion(tokenWithFlags({}))).toBe(CURRENT_SCHEMA_VERSION);
    expect(getTokenArt(tokenWithFlags({}))).toEqual(flags.art);
    expect(flags).toMatchObject({
      enabled: false,
      pitch: 0,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      art: {
        preset: "generic-ship",
        icon: "",
        forwardOffset: 0,
        mirror: { northSouth: false, eastWest: false }
      }
    });
    expect(Object.keys(flags.art.views)).toEqual(VIEW_DEFINITIONS.map(({ id }) => id));
  });

  it("reads the complete namespaced art configuration without sharing mutable input", () => {
    const token = tokenWithFlags({
      [MODULE_ID]: {
        schemaVersion: 1,
        enabled: true,
        pitch: 45,
        art: {
          preset: "custom",
          icon: "icons/ship.webp",
          forwardOffset: 12,
          mirror: { northSouth: true },
          views: { top: "icons/top.webp" }
        }
      }
    });

    const flags = getTacticalTokenFlags(token);

    expect(flags).toMatchObject({
      schemaVersion: 1,
      enabled: true,
      pitch: 45,
      art: {
        preset: "custom",
        icon: "icons/ship.webp",
        forwardOffset: 12,
        mirror: { northSouth: true, eastWest: false },
        views: { top: "icons/top.webp" }
      }
    });
    expect(flags.art).not.toBe(token.flags[MODULE_ID].art);
  });
});
