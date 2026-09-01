import {
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
    const value = document.getFlag(TOKEN_FLAG_SCOPE, key);
    if (value !== undefined) return value;
  }

  return document.flags?.[TOKEN_FLAG_SCOPE]?.[key];
}

export function normalizeTokenArt(value) {
  const art = isRecord(value) ? value : {};
  const mirror = isRecord(art.mirror) ? art.mirror : {};
  const sourceViews = isRecord(art.views) ? art.views : {};
  const views = Object.fromEntries(VIEW_DEFINITIONS.map(({ id }) => [
    id,
    typeof sourceViews[id] === "string" ? sourceViews[id] : ""
  ]));

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
  return getTokenFlag(documentOrPrototype, TOKEN_PARTICIPATION_FLAG, false) === true;
}

/** Read the stored pitch. TacticalTokenState normalizes valid numeric values for display. */
export function getTokenPitch(documentOrPrototype) {
  const value = getTokenFlag(documentOrPrototype, TOKEN_PITCH_FLAG, 0);
  return finiteNumber(value) ? value : 0;
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
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_PITCH_FLAG}`]: finiteNumber(pitch) ? pitch : 0,
    [`flags.${TOKEN_FLAG_SCOPE}.${TOKEN_ART_FLAG}`]: normalizeTokenArt(art)
  };
}

/** Read a valid stored schema version, falling back to the current version. */
export function getTokenSchemaVersion(documentOrPrototype) {
  const value = getTokenFlag(documentOrPrototype, TOKEN_SCHEMA_VERSION_FLAG);
  return Number.isInteger(value) && value > 0 ? value : CURRENT_SCHEMA_VERSION;
}

/**
 * Read all tactical configuration shared by placed and prototype token data.
 * Foundry copies prototype flags into new placed tokens; this accessor does not
 * consult a prototype when reading an existing placed TokenDocument.
 */
export function getTacticalTokenFlags(documentOrPrototype) {
  return freezeObject({
    schemaVersion: getTokenSchemaVersion(documentOrPrototype),
    enabled: getTokenParticipation(documentOrPrototype),
    pitch: getTokenPitch(documentOrPrototype),
    art: getTokenArt(documentOrPrototype)
  });
}

/** Explicitly named alias for callers handling Foundry prototype-token data. */
export function getPrototypeTacticalTokenFlags(prototypeToken) {
  return getTacticalTokenFlags(prototypeToken);
}

export function getDefaultTacticalTokenFlags() {
  return getTacticalTokenFlags({});
}
