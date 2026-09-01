import { MODULE_ID } from "./constants.js";

function translationKey(key) {
  return `${MODULE_ID}.${key}`;
}

function fallbackFormat(template, data = {}) {
  return String(template ?? "").replaceAll(/\{([^}]+)\}/g, (_match, key) => {
    const value = key.split(".").reduce((current, part) => current?.[part], data);
    return value === undefined || value === null ? `{${key}}` : String(value);
  });
}

/** Resolve a Foundry localization key while retaining a testable English fallback. */
export function localize(key, fallback = key) {
  const fullKey = translationKey(key);
  try {
    const translated = globalThis?.game?.i18n?.localize?.(fullKey);
    if (typeof translated === "string" && translated && translated !== fullKey) {
      return translated;
    }
  } catch {
    // Missing i18n during bootstrap or isolated tests falls back to English.
  }
  return fallback;
}

export function localizeFormat(key, fallback, data = {}) {
  const fullKey = translationKey(key);
  try {
    const formatted = globalThis?.game?.i18n?.format?.(fullKey, data);
    if (typeof formatted === "string" && formatted && formatted !== fullKey) {
      return formatted;
    }
  } catch {
    // Missing i18n during bootstrap or isolated tests falls back to English.
  }
  return fallbackFormat(localize(key, fallback), data);
}

export function viewLabel(viewId, fallback) {
  return localize(`views.${viewId}`, fallback);
}
