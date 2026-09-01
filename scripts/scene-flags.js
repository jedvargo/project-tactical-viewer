import { CURRENT_SCHEMA_VERSION, MODULE_ID } from "./constants.js";
import { SceneEligibilityService } from "./scene-eligibility.js";

export const SCENE_FLAG_SCOPE = MODULE_ID;
export const SCENE_ENABLED_FLAG = "enabled";
export const SCENE_SCHEMA_VERSION_FLAG = "schemaVersion";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeEnabled(value) {
  return value === true || value === "true";
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

/** Normalize every Scene flag shape written during development to v2. */
export function migrateSceneFlags(value) {
  const source = isRecord(value) ? value : {};
  const legacyEnabled = normalizeEnabled(value);
  const migrated = {
    ...Object.fromEntries(Object.entries(source)
      .filter(([key]) => ![SCENE_SCHEMA_VERSION_FLAG, SCENE_ENABLED_FLAG].includes(key))
      .map(([key, child]) => [key, cloneValue(child)])),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: normalizeEnabled(source.enabled) || legacyEnabled
  };
  return Object.freeze(migrated);
}

function rawSceneFlags(scene) {
  const namespace = scene?.flags?.[SCENE_FLAG_SCOPE];
  if (typeof namespace === "boolean") return namespace;
  if (isRecord(namespace)) return namespace;

  if (typeof scene?.getFlag !== "function") return undefined;
  try {
    const enabled = scene.getFlag(SCENE_FLAG_SCOPE, SCENE_ENABLED_FLAG);
    const schemaVersion = scene.getFlag(SCENE_FLAG_SCOPE, SCENE_SCHEMA_VERSION_FLAG);
    return { enabled, schemaVersion };
  } catch {
    return undefined;
  }
}

function rawEnabledValue(scene) {
  return rawSceneFlags(scene);
}

/** Read the normalized shared Scene flag namespace without changing Scene state. */
export function getSceneFlags(scene) {
  return migrateSceneFlags(rawEnabledValue(scene));
}

export function getSceneSchemaVersion(scene) {
  return getSceneFlags(scene).schemaVersion;
}

/** Read the shared namespaced enable flag without changing Scene state. */
export function getSceneEnabled(scene) {
  return getSceneFlags(scene).enabled;
}

/**
 * Persist the shared enable flag through Foundry's documented flag API.
 * Enabling an ineligible Scene is rejected without issuing a write.
 */
export async function setSceneEnabled(
  scene,
  enabled,
  { eligibilityService = new SceneEligibilityService() } = {}
) {
  if (!scene || typeof scene.setFlag !== "function") {
    throw new TypeError("A Scene with the documented setFlag method is required");
  }

  const nextValue = Boolean(enabled);
  const eligibility = typeof eligibilityService.isEligible === "function"
    ? eligibilityService.isEligible(scene)
    : eligibilityService.evaluate(scene);
  if (nextValue && !eligibility.eligible) return false;

  // Write the marker first so the legacy boolean-only accessor remains
  // readable while Foundry processes the two namespaced flag keys.
  await scene.setFlag(SCENE_FLAG_SCOPE, SCENE_SCHEMA_VERSION_FLAG, CURRENT_SCHEMA_VERSION);
  const result = await scene.setFlag(SCENE_FLAG_SCOPE, SCENE_ENABLED_FLAG, nextValue);
  if (result === false) return result;
  return result;
}
