import { MODULE_ID } from "./constants.js";
import { createModuleApi, createRuntime } from "./runtime.js";

const INIT_HOOK = "init";
const registeredHookBuses = new WeakSet();

let runtime;
let moduleApi;

function foundryHooks() {
  return typeof globalThis !== "undefined" ? globalThis.Hooks : undefined;
}

function foundryLogger() {
  return typeof globalThis !== "undefined" ? globalThis.console : undefined;
}

function foundrySettings() {
  return typeof globalThis !== "undefined" ? globalThis.game?.settings : undefined;
}

function publishModuleApi(api) {
  const module = globalThis?.game?.modules?.get?.(MODULE_ID);
  if (module) module.api = api;
}

/**
 * Register the module's lifecycle boundary and compose its runtime services.
 */
export function registerModuleLifecycle({ hooks = foundryHooks(), logger = foundryLogger() } = {}) {
  if (!hooks || typeof hooks.once !== "function") return false;
  if (registeredHookBuses.has(hooks)) return false;

  registeredHookBuses.add(hooks);
  hooks.once(INIT_HOOK, () => {
    if (!runtime) {
      runtime = createRuntime({ settings: foundrySettings() });
      runtime.initialize();
      moduleApi = createModuleApi(runtime);
      publishModuleApi(moduleApi);
    }
    logger?.info?.(`${MODULE_ID} | initialized`);
  });

  return true;
}

/**
 * Entrypoint used by module.json and directly by the lifecycle smoke test.
 * Dependency injection keeps the boundary testable without emulating Foundry.
 */
export function bootstrapModule(dependencies) {
  return registerModuleLifecycle(dependencies);
}

export function getRuntime() {
  return runtime;
}

export function getModuleApi() {
  return moduleApi;
}

bootstrapModule();
