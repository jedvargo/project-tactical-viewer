import { MODULE_ID } from "./constants.js";

export const TOKEN_DEBUG_GLOBAL_KEY = "__TACTICAL_3D_VIEWER_DEBUG__";

/**
 * Debug logging is opt-in so normal Foundry clients do not pay the console
 * noise cost. The global switch is useful while diagnosing a live world.
 */
export function isTokenDebugEnabled() {
  if (globalThis?.[TOKEN_DEBUG_GLOBAL_KEY] === true) return true;
  return false;
}

export function debugTokenUsage(event, details = {}) {
  if (!isTokenDebugEnabled()) return false;
  const logger = globalThis?.["console"]?.["debug"];
  if (typeof logger !== "function") return false;
  let serialized;
  try {
    serialized = JSON.stringify(details);
  } catch {
    serialized = String(details);
  }
  logger.call(globalThis?.["console"], `${MODULE_ID} | token-debug | ${event} ${serialized}`);
  return true;
}
