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

/**
 * User-scoped persistence boundary. Foundry's settings object is already
 * resolved for the current user; no user identity is stored in the layout.
 */
export class PersistenceService {
  #settings;
  #clock;
  #preferences;
  #initialized = false;

  constructor({ settings, now = () => Date.now() } = {}) {
    this.#settings = settings;
    this.#clock = now;
  }

  initialize() {
    if (!this.#initialized) {
      this.#preferences = migrateUserLayout(settingRead(this.#settings));
      this.#initialized = true;
    }
    return this.getPreferences();
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
