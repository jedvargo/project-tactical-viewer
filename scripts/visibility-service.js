function documentOf(tokenOrPlaceable) {
  return tokenOrPlaceable?.document ?? tokenOrPlaceable;
}

function defaultUserProvider() {
  return globalThis.game?.user;
}

function defaultPlaceableProvider(tokenDocument) {
  if (!tokenDocument || typeof tokenDocument !== "object") return undefined;
  if (tokenDocument.document) return tokenDocument;
  if (tokenDocument.object) return tokenDocument.object;

  const tokenId = tokenDocument.id;
  return tokenId === undefined
    ? undefined
    : globalThis.canvas?.tokens?.get?.(tokenId);
}

function readVisibilitySignal(placeable, tokenDocument) {
  for (const candidate of [placeable, tokenDocument]) {
    if (!candidate || !("isVisible" in candidate)) continue;
    const signal = candidate.isVisible;
    if (typeof signal === "function") return signal.call(candidate) === true;
    if (typeof signal === "boolean") return signal;
  }
  return undefined;
}

/**
 * Reads Foundry's documented Token placeable visibility signal at one boundary.
 * A missing placeable is deliberately fail-closed for ordinary users.
 */
export class VisibilityService {
  constructor({
    currentUser,
    userProvider = defaultUserProvider,
    placeableProvider = defaultPlaceableProvider
  } = {}) {
    this.currentUser = currentUser;
    this.userProvider = userProvider;
    this.placeableProvider = placeableProvider;
  }

  getCurrentUser() {
    return this.currentUser ?? this.userProvider?.();
  }

  resolvePlaceable(tokenOrPlaceable, explicitPlaceable) {
    if (explicitPlaceable !== undefined) return explicitPlaceable;
    if (tokenOrPlaceable?.document) return tokenOrPlaceable;
    const tokenDocument = documentOf(tokenOrPlaceable);
    return this.placeableProvider?.(tokenDocument, tokenOrPlaceable);
  }

  isVisible(tokenOrPlaceable, { placeable } = {}) {
    const tokenDocument = documentOf(tokenOrPlaceable);
    if (!tokenDocument || typeof tokenDocument !== "object") return false;

    const foundryPlaceable = this.resolvePlaceable(tokenOrPlaceable, placeable);
    const signal = readVisibilitySignal(foundryPlaceable, tokenDocument);
    if (signal !== undefined) return signal;

    // Foundry always has a current user in the real client. Treat an omitted
    // user as a test/diagnostic context, while an explicit non-GM fails closed.
    const user = this.getCurrentUser();
    return user?.isGM !== false;
  }

  canSee(tokenOrPlaceable, options = {}) {
    return this.isVisible(tokenOrPlaceable, options);
  }
}

export function isTokenVisible(tokenOrPlaceable, options = {}) {
  return new VisibilityService().isVisible(tokenOrPlaceable, options);
}
