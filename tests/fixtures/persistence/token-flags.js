import { MODULE_ID, CURRENT_SCHEMA_VERSION } from "../../../scripts/constants.js";

/** Persistent Token/prototype-token shapes used by the module during development. */
export const TOKEN_FLAG_FIXTURES = Object.freeze({
  v0: Object.freeze({ enabled: true, pitch: 45, icon: "icons/ship.webp" }),
  v1: Object.freeze({
    schemaVersion: 1,
    enabled: true,
    pitch: 45,
    art: Object.freeze({ preset: "generic-ship", icon: "icons/ship.webp" })
  }),
  v2: Object.freeze({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: true,
    pitch: 45,
    art: Object.freeze({ preset: "generic-ship", icon: "icons/ship.webp" })
  })
});

export const TOKEN_FLAG_NAMESPACE = MODULE_ID;
