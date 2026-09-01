import { MODULE_ID, CURRENT_SCHEMA_VERSION } from "../../../scripts/constants.js";

/** Persistent Scene shapes used by the module during development. */
export const SCENE_FLAG_FIXTURES = Object.freeze({
  v0: true,
  v1: Object.freeze({ enabled: true }),
  v2: Object.freeze({ schemaVersion: CURRENT_SCHEMA_VERSION, enabled: true })
});

export const SCENE_FLAG_NAMESPACE = MODULE_ID;
