import {
  ALLOWED_PITCHES,
  canonicalViewId,
  CURRENT_SCHEMA_VERSION,
  MODULE_ID,
  VIEW_DEFINITIONS
} from "../constants.js";

export const TOKEN_FLAG_SCOPE = MODULE_ID;
export const TOKEN_PARTICIPATION_FLAG = "enabled";
export const TOKEN_PITCH_FLAG = "pitch";
export const TOKEN_ART_FLAG = "art";
export const TOKEN_SCHEMA_VERSION_FLAG = "schemaVersion";

const DEFAULT_ART = Object.freeze({
  preset: "generic-ship",
  icon: "",
  forwardOffset: 0,
  mirror: Object.freeze({
    northSouth: false,
    eastWest: false
  }),
  views: Object.freeze(Object.fromEntries(
    VIEW_DEFINITIONS.map(({ id }) => [id, ""])
  ))
});

export const DEFAULT_TACTICAL_TOKEN_FLAGS = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  enabled: false,
  pitch: 0,
  art: DEFAULT_ART
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedPitch(value) {
  return ALLOWED_PITCHES.includes(value) ? value : 0;
}

function normalizedParticipation(value) {
  return value === true || value === "true";
}

function freezeObject(value) {
  if (!isRecord(value)) return value;
  for (const child of Object.values(value)) freezeObject(child);
  return Object.freeze(value);
}

function rawToken(documentOrPrototype, key) {
  const document = documentOrPrototype?.document ?? documentOrPrototype;
  if (!document || typeof document !== "object") return undefined;

  if (typeof document.getFlag === "function") {
    try {
      const value = document.getFlag(TOKEN_FLAG_SCOPE, key);
      if (value !== undefined) return value;
    } catch {
      return undefined;
    }
  }

  return document.flags?.[TOKEN_FLAG_SCOPE]?.[key];
}

function rawNamespace(documentOrPrototype) {
  const document = documentOrPrototype?.document ?? documentOrPrototype;
  if (!document || typeof document !== "object") return {};
  if (isRecord(document.flags?.[TOKEN_FLAG_SCOPE])) return document.flags[TOKEN_FLAG_SCOPE];
  if (typeof document.getFlag !== "function") return {};
  return Object.fromEntries([
    TOKEN_SCHEMA_VERSION_FLAG,
    TOKEN_PARTICIPATION_FLAG,
    TOKEN_PITCH_FLAG,
    TOKEN_ART_FLAG
  ].map((key) => [key, rawToken(document, key)])
    .filter(([, value]) => value !== undefined));
}

/** Normalize all historical tactical-token flag shapes to the current schema. */
export function migrateTokenFlags(value) {
  const source = isRecord(value) ? value : {};
  const legacyArt = isRecord(source.art)
    ? source.art
    : {
      icon: typeof source.icon === "string" ? source.icon : "",
      preset: source.preset,
      views: source.views,
      mirror: source.mirror,
      forwardOffset: source.forwardOffset
    };
  return freezeObject({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: normalizedParticipation(source.enabled),
    pitch: normalizedPitch(source.pitch),
    art: normalizeTokenArt(legacyArt)
  });
}

export function normalizeTokenArt(value) {
  const art = isRecord(value) ? value : {};
  const mirror = isRecord(art.mirror) ? art.mirror : {};
  const sourceViews = isRecord(art.views) ? art.views : {};
  const views = Object.fromEntries(VIEW_DEFINITIONS.map(({ id }) => [id, ""]));
  for (const [sourceView, source] of Object.entries(sourceViews)) {
    const view = canonicalViewId(sourceView);
    if (Object.hasOwn(views, view) && typeof source === "string" && !views[view]) {
      views[view] = source;
    }
  }
  // A current canonical value always wins over a migrated legacy value.
  for (const { id } of VIEW_DEFINITIONS) {
    if (typeof sourceViews[id] === "string") views[id] = sourceViews[id];
  }

  return freezeObject({
    preset: typeof art.preset === "string" && art.preset ? art.preset : DEFAULT_ART.preset,
    icon: typeof art.icon === "string" ? art.icon : DEFAULT_ART.icon,
    forwardOffset: finiteNumber(art.forwardOffset) ? art.forwardOffset : DEFAULT_ART.forwardOffset,
    mirror: {
      northSouth: mirror.northSouth === true,
      eastWest: mirror.eastWest === true
    },
    views
  });
}

/** Read one module-owned TokenDocument/prototype-token flag safely. */
export function getTokenFlag(documentOrPrototype, key, fallback) {
  const value = rawToken(documentOrPrototype, key);
  return value === undefined ? fallback : value;
}

/** Read the module-owned participation flag; only explicit true participates. */
export function getTokenParticipation(documentOrPrototype) {
  return normalizedParticipation(getTokenFlag(
    documentOrPrototype,
    TOKEN_PARTICIPATION_FLAG,
    false
  ));
}

/** Read the stored pitch. TacticalTokenState normalizes valid numeric values for display. */
export function getTokenPitch(documentOrPrototype) {
  const value = getTokenFlag(documentOrPrototype, TOKEN_PITCH_FLAG, 0);
  return normalizedPitch(value);
}

/** Read the normalized, defensive tactical-art configuration. */
export function getTokenArt(documentOrPrototype) {
  return normalizeTokenArt(getTokenFlag(documentOrPrototype, TOKEN_ART_FLAG));
}

/** Build one complete, namespaced configuration update for a TokenDocument. */
export function buildTokenFlagUpdate({ enabled = false, pitch = 0, art = {} } = {}) {
  return {
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_SCHEMA_VERSION_FLAG}`]: CURRENT_SCHEMA_VERSION,
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_PARTICIPATION_FLAG}`]: enabled === true,
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_PITCH_FLAG}`]: normalizedPitch(pitch),
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_ART_FLAG}`]: normalizeTokenArt(art)
  };
}

/** Read a valid stored schema version, falling back to the current version. */
export function getTokenSchemaVersion(documentOrPrototype) {
  return migrateTokenFlags(rawNamespace(documentOrPrototype)).schemaVersion;
}

/**
 * Read all tactical configuration shared by placed and prototype token data.
 * Foundry copies prototype flags into new placed tokens; this accessor does not
 * consult a prototype when reading an existing placed TokenDocument.
 */
export function getTacticalTokenFlags(documentOrPrototype) {
  const namespace = rawNamespace(documentOrPrototype);
  if (Object.keys(namespace).length > 0) return migrateTokenFlags(namespace);
  return DEFAULT_TACTICAL_TOKEN_FLAGS;
}

/** Explicitly named alias for callers handling Foundry prototype-token data. */
export function getPrototypeTacticalTokenFlags(prototypeToken) {
  return getTacticalTokenFlags(prototypeToken);
}

export function getDefaultTacticalTokenFlags() {
  return getTacticalTokenFlags({});
}
