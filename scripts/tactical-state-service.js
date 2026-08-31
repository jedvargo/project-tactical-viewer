function tokenArray(source) {
  if (!source) return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.contents)) return source.contents;
  if (typeof source.values === "function") return Array.from(source.values());
  if (typeof source[Symbol.iterator] === "function") return Array.from(source);
  if (typeof source === "object") return Object.values(source);
  return [];
}

function sceneTokens(scene, suppliedTokens) {
  if (suppliedTokens !== undefined) return tokenArray(suppliedTokens);
  return tokenArray(scene?.tokens);
}

/**
 * Runtime state boundary. Only this service enumerates tactical states for
 * renderer, hit-testing, stack, and accessible-summary consumers.
 */
export class TacticalStateService {
  constructor({ tacticalTokenState, visibilityService, permissionService } = {}) {
    this.tacticalTokenState = tacticalTokenState;
    this.visibilityService = visibilityService;
    this.permissionService = permissionService;
  }

  build(tokenDocument, scene, options = {}) {
    return this.tacticalTokenState.build(tokenDocument, scene, options);
  }

  getVisibleTacticalState(tokenDocument, scene, options = {}) {
    if (!this.visibilityService.isVisible(tokenDocument, options)) return null;
    return this.build(tokenDocument, scene, options);
  }

  getVisibleTacticalStates(scene = globalThis.canvas?.scene, options = {}) {
    const {
      tokens,
      ...stateOptions
    } = Array.isArray(options) ? { tokens: options } : options;
    const states = [];

    for (const tokenDocument of sceneTokens(scene, tokens)) {
      // Filter before state construction so hidden token state never reaches
      // a renderer-facing collection or an overlap/hit-test consumer.
      if (!this.visibilityService.isVisible(tokenDocument, stateOptions)) continue;
      const state = this.build(tokenDocument, scene, stateOptions);
      if (state.participating !== true) continue;
      if (state.visibleToCurrentUser !== true) continue;
      states.push(state);
    }

    return Object.freeze(states);
  }
}
