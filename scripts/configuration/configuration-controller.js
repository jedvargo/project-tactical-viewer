import {
  ALLOWED_PITCHES,
  canonicalViewId,
  CURRENT_SCHEMA_VERSION,
  MODULE_ID,
  VIEW_DEFINITIONS
} from "../constants.js";
import {
  buildTokenFlagUpdate as buildModelTokenFlagUpdate,
  normalizeTokenArt
} from "../model/token-flags.js";
import { OrientationAdapter } from "../model/orientation-adapter.js";
import { setSceneEnabled } from "../scene-flags.js";
import { TacticalUpdateService } from "../tactical-update-service.js";

export const SCENE_ENABLE_FIELD = `flags.${MODULE_ID}.enabled`;
export const TOKEN_ENABLED_FIELD = `flags.${MODULE_ID}.enabled`;
export const TOKEN_PITCH_FIELD = `flags.${MODULE_ID}.pitch`;
export const TOKEN_ART_FIELD = `flags.${MODULE_ID}.art`;

function readValue(source, name, fallback = null) {
  if (source && typeof source.get === "function") {
    const value = source.get(name);
    return value === null || value === undefined ? fallback : value;
  }
  if (source && typeof source === "object") {
    const value = source[name];
    return value === null || value === undefined ? fallback : value;
  }
  return fallback;
}

function booleanValue(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function textValue(source, name, fallback = "") {
  const value = readValue(source, name, fallback);
  return typeof value === "string" ? value.trim() : value == null ? fallback : String(value);
}

function numberValue(source, name, fallback = 0) {
  const value = Number(readValue(source, name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function pitchValue(source, orientationAdapter) {
  const raw = Number(readValue(source, TOKEN_PITCH_FIELD, 0));
  if (!Number.isFinite(raw)) return 0;
  try {
    return orientationAdapter.snapPitch(raw);
  } catch {
    return ALLOWED_PITCHES.includes(raw) ? raw : 0;
  }
}

export function serializeSceneConfiguration(source) {
  return { enabled: booleanValue(readValue(source, SCENE_ENABLE_FIELD, false)) };
}

/** Serialize the fields used by both placed TokenConfig and PrototypeTokenConfig. */
export function serializeTokenConfiguration(
  source,
  { fallbackArt = {}, orientationAdapter = new OrientationAdapter() } = {}
) {
  const views = Object.fromEntries(VIEW_DEFINITIONS.map(({ id }) => [
    id,
    textValue(
      source,
      `flags.${MODULE_ID}.art.views.${id}`,
      fallbackArt?.views?.[id]
        ?? Object.entries(fallbackArt?.views ?? {})
          .find(([view]) => canonicalViewId(view) === id)?.[1]
        ?? ""
    )
  ]));
  const art = normalizeTokenArt({
    preset: textValue(source, `flags.${MODULE_ID}.art.preset`, fallbackArt?.preset ?? "generic-ship"),
    icon: textValue(source, `flags.${MODULE_ID}.art.icon`, fallbackArt?.icon ?? ""),
    forwardOffset: numberValue(
      source,
      `flags.${MODULE_ID}.art.forwardOffset`,
      fallbackArt?.forwardOffset ?? 0
    ),
    mirror: {
      northSouth: booleanValue(readValue(
        source,
        `flags.${MODULE_ID}.art.mirror.northSouth`,
        fallbackArt?.mirror?.northSouth ?? false
      )),
      eastWest: booleanValue(readValue(
        source,
        `flags.${MODULE_ID}.art.mirror.eastWest`,
        fallbackArt?.mirror?.eastWest ?? false
      ))
    },
    views
  });

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    enabled: booleanValue(readValue(source, TOKEN_ENABLED_FIELD, false)),
    pitch: pitchValue(source, orientationAdapter),
    art
  };
}

export function buildTokenFlagUpdate(configuration) {
  return buildModelTokenFlagUpdate(configuration);
}

export async function writeSceneConfiguration(scene, source, { eligibilityService } = {}) {
  const { enabled } = source && typeof source.enabled === "boolean"
    ? source
    : serializeSceneConfiguration(source);
  return setSceneEnabled(scene, enabled, { eligibilityService });
}

async function writeTokenConfiguration(
  document,
  configuration,
  { updateService = new TacticalUpdateService() } = {}
) {
  if (typeof updateService?.setConfiguration !== "function") {
    throw new TypeError("A TacticalUpdateService is required for tactical configuration writes");
  }
  return updateService.setConfiguration(document, configuration);
}

export { writeTokenConfiguration };

export function writePrototypeTokenConfiguration(document, configuration, options = {}) {
  return writeTokenConfiguration(document, configuration, options);
}
