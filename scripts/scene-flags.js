import { MODULE_ID } from "./constants.js";
import { SceneEligibilityService } from "./scene-eligibility.js";

export const SCENE_FLAG_SCOPE = MODULE_ID;
export const SCENE_ENABLED_FLAG = "enabled";

function rawEnabledValue(scene) {
  if (typeof scene?.getFlag === "function") {
    return scene.getFlag(SCENE_FLAG_SCOPE, SCENE_ENABLED_FLAG);
  }
  return scene?.flags?.[SCENE_FLAG_SCOPE]?.[SCENE_ENABLED_FLAG];
}

/** Read the shared namespaced enable flag without changing Scene state. */
export function getSceneEnabled(scene) {
  const value = rawEnabledValue(scene);
  return value === true || Boolean(value && typeof value === "object" && value.enabled === true);
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

  return scene.setFlag(SCENE_FLAG_SCOPE, SCENE_ENABLED_FLAG, nextValue);
}
