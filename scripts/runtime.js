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
import { Canvas2DRendererV1 } from "./rendering/canvas-renderer.js";
import { AssetManager } from "./rendering/asset-manager.js";
import { PersistenceService } from "./persistence/user-layouts.js";
import { SceneEligibilityService } from "./scene-eligibility.js";
import { getSceneEnabled, setSceneEnabled } from "./scene-flags.js";
import { AUTO_OPEN_SETTING_KEY, registerSettings } from "./settings.js";
import { SynchronizationCoordinator } from "./synchronization-coordinator.js";
import { TacticalStateService } from "./tactical-state-service.js";
import { TacticalUpdateService } from "./tactical-update-service.js";
import { VisibilityService } from "./visibility-service.js";
import { VIEW_REGISTRY } from "./view-registry.js";
import { TacticalViewerApplication } from "./viewer/tactical-viewer-application.js";
import { ConfigurationUIService } from "./configuration/configuration-ui.js";
import {
  serializeSceneConfiguration,
  serializeTokenConfiguration,
  writePrototypeTokenConfiguration,
  writeSceneConfiguration,
  writeTokenConfiguration
} from "./configuration/configuration-controller.js";

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
  hooks,
  synchronizationCoordinator,
  synchronizationScheduler,
  visibilityService,
  permissionService,
  tacticalStateService,
  tacticalUpdateService,
  renderer,
  assetManager,
  viewerApplicationClass = TacticalViewerApplication,
  keybindings
} = {}) {
  let initialized = false;
  let activeViewer;
  let keybindingRegistered = false;
  let sceneSession;
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
  const resolvedTacticalUpdateService = tacticalUpdateService ?? new TacticalUpdateService({
    coordinateAdapter: resolvedCoordinateAdapter,
    elevationAdapter: resolvedElevationAdapter,
    orientationAdapter,
    permissionService: resolvedPermissionService
  });
  const resolvedConfigurationUI = new ConfigurationUIService({
    hooks,
    sceneEligibilityService: sceneEligibility
  });
  const resolvedSynchronizationCoordinator = synchronizationCoordinator
    ?? new SynchronizationCoordinator({
      hooks,
      scheduler: synchronizationScheduler
    });
  const resolvedPersistenceService = persistenceService ?? new PersistenceService({ settings });
  const resolvedAssetManager = assetManager ?? new AssetManager();
  const resolvedRenderer = renderer ?? new Canvas2DRendererV1({
    coordinateAdapter: resolvedCoordinateAdapter,
    projectionEngine,
    assetManager: resolvedAssetManager
  });
  services.set("orientationAdapter", orientationAdapter);
  services.set("coordinateAdapter", resolvedCoordinateAdapter);
  services.set("elevationAdapter", resolvedElevationAdapter);
  services.set("tacticalTokenState", resolvedTacticalTokenState);
  services.set("tacticalState", resolvedTacticalStateService);
  services.set("tacticalUpdate", resolvedTacticalUpdateService);
  services.set("visibility", resolvedVisibilityService);
  services.set("permission", resolvedPermissionService);
  services.set("projectionEngine", projectionEngine);
  services.set("distance", distance);
  services.set("persistence", resolvedPersistenceService);
  services.set("synchronization", resolvedSynchronizationCoordinator);
  services.set("sceneEligibility", sceneEligibility);
  services.set("settings", settings);
  services.set("renderer", resolvedRenderer);
  services.set("assets", resolvedAssetManager);
  services.set("configurationUI", resolvedConfigurationUI);

  const sceneIdOf = (scene) => scene?.id ?? scene?._id;
  const sceneFromCanvas = (canvasOrScene) => canvasOrScene?.scene ?? canvasOrScene;
  const autoOpenEnabled = () => {
    try {
      const value = settings?.get?.(MODULE_ID, AUTO_OPEN_SETTING_KEY);
      return typeof value === "boolean" ? value : true;
    } catch {
      return true;
    }
  };

  const markApplicationClosed = (viewer, { source = "application" } = {}) => {
    if (activeViewer === viewer) activeViewer = undefined;
    if (source === "application"
      && sceneSession
      && sceneIdOf(viewer?.scene) === sceneSession.sceneId
      && !sceneSession.closingForLifecycle) {
      sceneSession.manuallyClosed = true;
    }
  };

  const closeActiveViewer = async ({ manual = false, reason = "manual" } = {}) => {
    const viewer = activeViewer;
    activeViewer = undefined;
    if (!viewer) return null;
    if (manual && sceneSession && sceneIdOf(viewer.scene) === sceneSession.sceneId) {
      sceneSession.manuallyClosed = true;
    }
    sceneSession && (sceneSession.closingForLifecycle = !manual);
    try {
      if (typeof viewer.close === "function") await viewer.close({ reason });
    } finally {
      if (sceneSession) sceneSession.closingForLifecycle = false;
    }
    return viewer;
  };

  const ensureSceneSession = (scene) => {
    const sceneId = sceneIdOf(scene);
    if (!sceneSession || sceneSession.ended || sceneSession.sceneId !== sceneId) {
      sceneSession = {
        scene,
        sceneId,
        ended: false,
        manuallyClosed: false,
        autoOpened: false,
        closingForLifecycle: false
      };
    } else {
      sceneSession.scene = scene;
    }
    return sceneSession;
  };

  const handleCanvasReady = async (canvasOrScene) => {
    const scene = sceneFromCanvas(canvasOrScene);
    if (!scene || sceneIdOf(scene) === undefined) return null;
    const session = ensureSceneSession(scene);
    if (activeViewer && sceneIdOf(activeViewer.scene) !== session.sceneId) {
      await closeActiveViewer({ reason: "scene-change" });
    }
    if (!getSceneEnabled(scene) || !sceneEligibility.isEligible(scene).eligible) {
      if (activeViewer) await closeActiveViewer({ reason: "scene-ineligible" });
      return null;
    }
    if (!autoOpenEnabled() || session.manuallyClosed || session.autoOpened) {
      return activeViewer ?? null;
    }
    session.autoOpened = true;
    return runtime.openViewer(scene, { autoOpened: true });
  };

  const handleCanvasTearDown = async (canvasOrScene) => {
    const scene = sceneFromCanvas(canvasOrScene);
    if (activeViewer && (!scene || sceneIdOf(activeViewer.scene) === sceneIdOf(scene))) {
      await closeActiveViewer({ reason: "scene-teardown" });
    }
    if (sceneSession && (!scene || sceneSession.sceneId === sceneIdOf(scene))) {
      sceneSession.ended = true;
    }
    return null;
  };

  const handleSceneUpdate = async (scene) => {
    if (!scene || !activeViewer || sceneIdOf(activeViewer.scene) !== sceneIdOf(scene)) return null;
    if (!getSceneEnabled(scene) || !sceneEligibility.isEligible(scene).eligible) {
      return closeActiveViewer({ reason: "scene-update" });
    }
    return activeViewer.refreshFromDocuments?.({ render: true }) ?? activeViewer;
  };

  const handleLifecycle = (event) => {
    if (event?.type === "canvas-ready") return void handleCanvasReady(event.canvas ?? event.scene);
    if (event?.type === "canvas-teardown") return void handleCanvasTearDown(event.canvas ?? event.scene);
    if (event?.type === "scene-update") return void handleSceneUpdate(event.scene);
    return undefined;
  };

  if (typeof resolvedSynchronizationCoordinator.subscribeLifecycle === "function") {
    resolvedSynchronizationCoordinator.subscribeLifecycle(handleLifecycle);
  }

  const runtime = {
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
      this.registerReopenKeybinding(keybindings);
      resolvedSynchronizationCoordinator.start();
      resolvedConfigurationUI.start();
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

    async openViewer(scene, viewerOptions = {}) {
      if (!this.isSceneEnabled(scene)) return null;

      if (activeViewer?.scene === scene) {
        if (!activeViewer.rendered && typeof activeViewer.render === "function") {
          await activeViewer.render(true);
        }
        return activeViewer;
      }

      if (activeViewer && typeof activeViewer.close === "function") {
        await closeActiveViewer({ reason: "viewer-replaced" });
      }

      ensureSceneSession(scene);

      const Application = viewerOptions.applicationClass ?? viewerApplicationClass;
      const {
        applicationClass: ignoredApplicationClass,
        ...applicationConfiguration
      } = viewerOptions;
      activeViewer = new Application({
        ...applicationConfiguration,
        scene,
        viewRegistry,
        persistenceService: resolvedPersistenceService,
        synchronizationCoordinator: resolvedSynchronizationCoordinator,
        tacticalStateService: resolvedTacticalStateService,
        tacticalUpdateService: resolvedTacticalUpdateService,
        coordinateAdapter: resolvedCoordinateAdapter,
        projectionEngine,
        assetManager: resolvedAssetManager,
        renderer: applicationConfiguration.renderer ?? resolvedRenderer,
        onClosed: markApplicationClosed
      });

      try {
        await activeViewer.render?.(true);
        return activeViewer;
      } catch (error) {
        activeViewer = undefined;
        throw error;
      }
    },

    async closeViewer() {
      return closeActiveViewer({ manual: true });
    },

    async toggleViewer(scene = sceneFromCanvas(globalThis?.canvas)) {
      const currentScene = scene ?? sceneFromCanvas(globalThis?.canvas);
      if (!currentScene) return null;
      if (activeViewer && sceneIdOf(activeViewer.scene) === sceneIdOf(currentScene)) {
        return this.closeViewer();
      }
      return this.openViewer(currentScene, { source: "keybinding" });
    },

    async refreshViewer() {
      return activeViewer?.refreshFromDocuments?.() ?? null;
    },

    registerReopenKeybinding(bindingService = keybindings ?? globalThis?.game?.keybindings) {
      if (keybindingRegistered || typeof bindingService?.register !== "function") return false;
      bindingService.register(MODULE_ID, "reopenViewer", {
        name: "Reopen 3D Tactical Viewer",
        hint: "Open Tactical Viewer for the active Scene.",
        editable: [{ key: "KeyV", modifiers: ["CONTROL", "SHIFT"] }],
        onDown: () => {
          void this.toggleViewer();
          return true;
        },
        onUp: () => false,
        precedence: globalThis?.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 1
      });
      keybindingRegistered = true;
      return true;
    },

    getViewerApplication() {
      return activeViewer ?? null;
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

  return runtime;
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
    getTacticalUpdateService: () => runtime.getService("tacticalUpdate"),
    getSynchronizationCoordinator: () => runtime.getService("synchronization"),
    onInvalidation: (listener) => runtime.getService("synchronization").subscribe(listener),
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
    getAssetManager: () => runtime.getService("assets"),
    getConfigurationUI: () => runtime.getService("configurationUI"),
    serializeSceneConfiguration,
    serializeTokenConfiguration,
    writeSceneConfiguration: (scene, source) => writeSceneConfiguration(scene, source, {
      eligibilityService: runtime.getService("sceneEligibility")
    }),
    writeTokenConfiguration: (token, configuration) => writeTokenConfiguration(token, configuration, {
      updateService: runtime.getService("tacticalUpdate")
    }),
    writePrototypeTokenConfiguration: (prototypeToken, configuration) => writePrototypeTokenConfiguration(
      prototypeToken,
      configuration,
      { updateService: runtime.getService("tacticalUpdate") }
    ),
    getUserPreferences: () => runtime.getService("persistence").getPreferences(),
    getTacticalState: (token, scene, options) => runtime
      .getService("tacticalState")
      .getVisibleTacticalState(token, scene, options),
    getVisibleTacticalStates: (scene, options) => runtime
      .getService("tacticalState")
      .getVisibleTacticalStates(scene, options),
    moveXY: (...args) => runtime.getService("tacticalUpdate").moveXY(...args),
    moveXZ: (...args) => runtime.getService("tacticalUpdate").moveXZ(...args),
    moveYZ: (...args) => runtime.getService("tacticalUpdate").moveYZ(...args),
    setHeading: (...args) => runtime.getService("tacticalUpdate").setHeading(...args),
    setPitch: (...args) => runtime.getService("tacticalUpdate").setPitch(...args),
    openViewer: (scene, options) => runtime.openViewer(scene, options),
    closeViewer: () => runtime.closeViewer(),
    toggleViewer: (scene) => runtime.toggleViewer(scene),
    refreshViewer: () => runtime.refreshViewer(),
    getViewerApplication: () => runtime.getViewerApplication(),
    isSceneEligible: (scene) => runtime.isSceneEligible(scene),
    isSceneEnabled: (scene) => runtime.isSceneEnabled(scene),
    setSceneEnabled: (scene, enabled) => runtime.setSceneEnabled(scene, enabled)
  });
}
