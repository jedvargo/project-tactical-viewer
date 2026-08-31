import {
  CURRENT_SCHEMA_VERSION,
  MODULE_ID
} from "./constants.js";
import { CoordinateAdapter } from "./model/coordinate-adapter.js";
import { chebyshevDistance3d } from "./model/distance.js";
import { ElevationAdapter } from "./model/elevation-adapter.js";
import { OrientationAdapter } from "./model/orientation-adapter.js";
import { TacticalTokenState } from "./model/tactical-token-state.js";
import { PermissionService } from "./permission-service.js";
import { ProjectionEngine } from "./projection/projection-engine.js";
import { PersistenceService } from "./persistence/user-layouts.js";
import { SceneEligibilityService } from "./scene-eligibility.js";
import { getSceneEnabled, setSceneEnabled } from "./scene-flags.js";
import { registerSettings } from "./settings.js";
import { TacticalStateService } from "./tactical-state-service.js";
import { VisibilityService } from "./visibility-service.js";
import { VIEW_REGISTRY } from "./view-registry.js";

/**
 * Minimal composition root. Later prompts attach concrete services through
 * this object; no service is invented before it has an implementation.
 */
export function createRuntime({
  viewRegistry = VIEW_REGISTRY,
  orientationAdapter = new OrientationAdapter(),
  coordinateAdapter,
  elevationAdapter,
  tacticalTokenState,
  projectionEngine = new ProjectionEngine(),
  distance = chebyshevDistance3d,
  settings,
  persistenceService,
  currentUser,
  visibilityService,
  permissionService,
  tacticalStateService
} = {}) {
  let initialized = false;
  const services = new Map();
  const sceneEligibility = new SceneEligibilityService();
  const resolvedElevationAdapter = elevationAdapter
    ?? coordinateAdapter?.elevationAdapter
    ?? new ElevationAdapter();
  const resolvedCoordinateAdapter = coordinateAdapter ?? new CoordinateAdapter({
    eligibilityService: sceneEligibility,
    elevationAdapter: resolvedElevationAdapter
  });
  const resolvedVisibilityService = visibilityService ?? new VisibilityService({ currentUser });
  const resolvedPermissionService = permissionService ?? new PermissionService({ currentUser });
  const resolvedTacticalTokenState = tacticalTokenState ?? new TacticalTokenState({
    coordinateAdapter: resolvedCoordinateAdapter,
    orientationAdapter,
    visibilityService: resolvedVisibilityService,
    permissionService: resolvedPermissionService
  });
  const resolvedTacticalStateService = tacticalStateService ?? new TacticalStateService({
    tacticalTokenState: resolvedTacticalTokenState,
    visibilityService: resolvedVisibilityService,
    permissionService: resolvedPermissionService
  });
  const resolvedPersistenceService = persistenceService ?? new PersistenceService({ settings });
  services.set("orientationAdapter", orientationAdapter);
  services.set("coordinateAdapter", resolvedCoordinateAdapter);
  services.set("elevationAdapter", resolvedElevationAdapter);
  services.set("tacticalTokenState", resolvedTacticalTokenState);
  services.set("tacticalState", resolvedTacticalStateService);
  services.set("visibility", resolvedVisibilityService);
  services.set("permission", resolvedPermissionService);
  services.set("projectionEngine", projectionEngine);
  services.set("distance", distance);
  services.set("persistence", resolvedPersistenceService);
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
      resolvedPersistenceService.initialize();
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
    getCoordinateAdapter: () => runtime.getService("coordinateAdapter"),
    getElevationAdapter: () => runtime.getService("elevationAdapter"),
    getTacticalTokenState: () => runtime.getService("tacticalTokenState"),
    getTacticalStateService: () => runtime.getService("tacticalState"),
    getVisibilityService: () => runtime.getService("visibility"),
    getPermissionService: () => runtime.getService("permission"),
    getProjectionEngine: () => runtime.getService("projectionEngine"),
    projectPoint: (...args) => runtime.getService("projectionEngine").projectPoint(...args),
    projectVector: (...args) => runtime.getService("projectionEngine").projectVector(...args),
    depthKey: (...args) => runtime.getService("projectionEngine").depthKey(...args),
    sortByDepth: (...args) => runtime.getService("projectionEngine").sortByDepth(...args),
    inversePoint: (...args) => runtime.getService("projectionEngine").inversePoint(...args),
    getDistance: (...deltas) => runtime.getService("distance")(...deltas),
    getElevationForTacticalZ: (...args) => runtime
      .getService("coordinateAdapter")
      .toElevation(...args),
    moveElevationByTacticalDelta: (...args) => runtime
      .getService("coordinateAdapter")
      .moveElevationByTacticalDelta(...args),
    getPersistenceService: () => runtime.getService("persistence"),
    getUserPreferences: () => runtime.getService("persistence").getPreferences(),
    getTacticalState: (token, scene, options) => runtime
      .getService("tacticalState")
      .getVisibleTacticalState(token, scene, options),
    getVisibleTacticalStates: (scene, options) => runtime
      .getService("tacticalState")
      .getVisibleTacticalStates(scene, options),
    isSceneEligible: (scene) => runtime.isSceneEligible(scene),
    isSceneEnabled: (scene) => runtime.isSceneEnabled(scene),
    setSceneEnabled: (scene, enabled) => runtime.setSceneEnabled(scene, enabled)
  });
}
