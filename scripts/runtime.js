import {
  CURRENT_SCHEMA_VERSION,
  MODULE_ID
} from "./constants.js";
import { chebyshevDistance3d } from "./model/distance.js";
import { OrientationAdapter } from "./model/orientation-adapter.js";
import { SceneEligibilityService } from "./scene-eligibility.js";
import { getSceneEnabled, setSceneEnabled } from "./scene-flags.js";
import { registerSettings } from "./settings.js";
import { VIEW_REGISTRY } from "./view-registry.js";

/**
 * Minimal composition root. Later prompts attach concrete services through
 * this object; no service is invented before it has an implementation.
 */
export function createRuntime({
  viewRegistry = VIEW_REGISTRY,
  orientationAdapter = new OrientationAdapter(),
  distance = chebyshevDistance3d,
  settings
} = {}) {
  let initialized = false;
  const services = new Map();
  const sceneEligibility = new SceneEligibilityService();
  services.set("orientationAdapter", orientationAdapter);
  services.set("distance", distance);
  services.set("sceneEligibility", sceneEligibility);
  services.set("settings", settings);

  return {
    get initialized() {
      return initialized;
    },

    moduleId: MODULE_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    viewRegistry,

    initialize() {
      if (initialized) return false;
      registerSettings(settings);
      initialized = true;
      return true;
    },

    isSceneEligible(scene) {
      return sceneEligibility.evaluate(scene);
    },

    isSceneEnabled(scene) {
      return getSceneEnabled(scene) && sceneEligibility.isEligible(scene).eligible;
    },

    setSceneEnabled(scene, enabled) {
      return setSceneEnabled(scene, enabled, { eligibilityService: sceneEligibility });
    },

    attachService(name, service) {
      if (typeof name !== "string" || !name) {
        throw new TypeError("A runtime service requires a name");
      }
      if (services.has(name)) {
        throw new Error(`Runtime service already attached: ${name}`);
      }
      services.set(name, service);
      return service;
    },

    getService(name) {
      return services.get(name);
    }
  };
}

export function createModuleApi(runtime) {
  const getDiagnostics = () => Object.freeze({
    moduleId: runtime.moduleId,
    schemaVersion: runtime.schemaVersion,
    views: runtime.viewRegistry.list()
  });

  return Object.freeze({
    getDiagnostics,
    getModuleInfo: () => Object.freeze({
      moduleId: runtime.moduleId,
      schemaVersion: runtime.schemaVersion
    }),
    getViewRegistry: () => runtime.viewRegistry,
    getOrientationAdapter: () => runtime.getService("orientationAdapter"),
    getDistance: (...deltas) => runtime.getService("distance")(...deltas),
    isSceneEligible: (scene) => runtime.isSceneEligible(scene),
    isSceneEnabled: (scene) => runtime.isSceneEnabled(scene),
    setSceneEnabled: (scene, enabled) => runtime.setSceneEnabled(scene, enabled)
  });
}
