import { MODULE_ID } from "../constants.js";
import {
  cloneLayout,
  defaultSceneLayout,
  migrateUserLayout,
  pruneSceneLayouts
} from "./migrations.js";
import { USER_LAYOUT_SETTING_KEY } from "../settings.js";

export { USER_LAYOUT_SETTING_KEY };

function settingRead(settings) {
  if (!settings || typeof settings.get !== "function") return undefined;
  try {
    return settings.get(MODULE_ID, USER_LAYOUT_SETTING_KEY);
  } catch {
    return undefined;
  }
}

function sameSerializableValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * User-scoped persistence boundary. Foundry's settings object is already
 * resolved for the current user; no user identity is stored in the layout.
 */
export class PersistenceService {
  #settings;
  #clock;
  #preferences;
  #migrationPromise = Promise.resolve();
  #initialized = false;

  constructor({ settings, now = () => Date.now() } = {}) {
    this.#settings = settings;
    this.#clock = now;
  }

  initialize() {
    if (!this.#initialized) {
      const rawPreferences = settingRead(this.#settings);
      this.#preferences = migrateUserLayout(rawPreferences);
      this.#initialized = true;
      if (rawPreferences !== undefined
        && !sameSerializableValue(rawPreferences, this.#preferences)
        && typeof this.#settings?.set === "function") {
        try {
          this.#migrationPromise = Promise.resolve(this.#settings.set(
            MODULE_ID,
            USER_LAYOUT_SETTING_KEY,
            this.#preferences
          )).catch(() => undefined);
        } catch {
          this.#migrationPromise = Promise.resolve();
        }
      }
    }
    return this.getPreferences();
  }

  /** Resolve the one-time best-effort write-back of a healed layout setting. */
  get migrationPromise() {
    return this.#migrationPromise;
  }

  get initialized() {
    return this.#initialized;
  }

  getPreferences() {
    if (!this.#initialized) this.initialize();
    return cloneLayout(this.#preferences);
  }

  getDefaults() {
    return this.getPreferences().defaults;
  }

  getSceneLayout(sceneId) {
    if (typeof sceneId !== "string" || !sceneId) return null;
    const preferences = this.getPreferences();
    return preferences.scenes[sceneId]
      ? cloneLayout(preferences.scenes[sceneId])
      : defaultSceneLayout(preferences.defaults);
  }

  getAllSceneLayouts() {
    return cloneLayout(this.getPreferences().scenes);
  }

  async saveSceneLayout(sceneId, layout, { lastUsed = this.#clock() } = {}) {
    if (typeof sceneId !== "string" || !sceneId) {
      throw new TypeError("A Scene ID is required to save a layout");
    }
    if (!this.#initialized) this.initialize();
    await this.#migrationPromise;

    const nextScene = migrateUserLayout({
      ...this.#preferences,
      scenes: { [sceneId]: { ...layout, lastUsed } }
    }).scenes[sceneId];
    if (!nextScene) throw new TypeError("A valid Scene layout is required");

    const nextPreferences = migrateUserLayout({
      ...this.#preferences,
      scenes: {
        ...this.#preferences.scenes,
        [sceneId]: nextScene
      }
    });
    nextPreferences.scenes = pruneSceneLayouts(nextPreferences.scenes);

    if (this.#settings && typeof this.#settings.set === "function") {
      await this.#settings.set(MODULE_ID, USER_LAYOUT_SETTING_KEY, nextPreferences);
    }
    this.#preferences = nextPreferences;
    return cloneLayout(nextScene);
  }
}
