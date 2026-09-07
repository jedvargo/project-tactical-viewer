import { debugTokenUsage } from "./debug.js";

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
    const sourceTokens = sceneTokens(scene, tokens);
    const states = [];
    debugTokenUsage("state-scan", {
      sceneId: scene?.id ?? null,
      sourceTokenCount: sourceTokens.length,
      suppliedTokenCount: tokens === undefined ? null : sourceTokens.length,
      sourceTokens: sourceTokens.map((tokenDocument) => ({
        tokenId: tokenDocument?.document?.id ?? tokenDocument?.id ?? null,
        tokenName: tokenDocument?.document?.name ?? tokenDocument?.name ?? ""
      }))
    });

    for (const tokenDocument of sourceTokens) {
      const tokenId = tokenDocument?.document?.id ?? tokenDocument?.id ?? null;
      const tokenName = tokenDocument?.document?.name ?? tokenDocument?.name ?? "";
      // Filter before state construction so hidden token state never reaches
      // a renderer-facing collection or an overlap/hit-test consumer.
      const visible = this.visibilityService.isVisible(tokenDocument, stateOptions);
      if (!visible) {
        debugTokenUsage("state-skip", {
          tokenId,
          tokenName,
          reason: "not-visible"
        });
        continue;
      }
      const state = this.build(tokenDocument, scene, stateOptions);
      if (state.participating !== true) {
        debugTokenUsage("state-skip", {
          tokenId: state.tokenId ?? tokenId,
          tokenName: state.name || tokenName,
          reason: "not-participating",
          enabled: state.enabled,
          participating: state.participating
        });
        continue;
      }
      if (state.visibleToCurrentUser !== true) {
        debugTokenUsage("state-skip", {
          tokenId: state.tokenId ?? tokenId,
          tokenName: state.name || tokenName,
          reason: "state-not-visible",
          visibleToCurrentUser: state.visibleToCurrentUser
        });
        continue;
      }
      debugTokenUsage("state-accepted", {
        tokenId: state.tokenId ?? tokenId,
        tokenName: state.name || tokenName,
        actorName: state.actorName,
        textureSource: state.textureSource,
        actorTextureSource: state.actorTextureSource,
        enabled: state.enabled,
        participating: state.participating
      });
      states.push(state);
    }

    debugTokenUsage("state-scan-complete", {
      sceneId: scene?.id ?? null,
      acceptedTokenCount: states.length,
      acceptedTokenIds: states.map((state) => state.tokenId)
    });
    return Object.freeze(states);
  }
}
