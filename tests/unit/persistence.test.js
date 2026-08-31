import { describe, expect, it } from "vitest";

import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  DEFAULT_OVERLAYS,
  DEFAULT_USER_LAYOUT,
  MAX_SCENE_LAYOUTS,
  migrateUserLayout,
  pruneSceneLayouts
} from "../../scripts/persistence/migrations.js";
import {
  PersistenceService,
  USER_LAYOUT_SETTING_KEY
} from "../../scripts/persistence/user-layouts.js";
import { MODULE_ID } from "../../scripts/constants.js";
import { SETTING_DEFINITIONS } from "../../scripts/settings.js";

function settingDefinition(key) {
  return SETTING_DEFINITIONS.find((definition) => definition.key === key);
}

function makeSettings(initialValue) {
  let value = initialValue;
  return {
    reads: 0,
    writes: [],
    get(namespace, key) {
      expect(namespace).toBe(MODULE_ID);
      expect(key).toBe(USER_LAYOUT_SETTING_KEY);
      this.reads += 1;
      return value;
    },
    async set(namespace, key, nextValue) {
      expect(namespace).toBe(MODULE_ID);
      expect(key).toBe(USER_LAYOUT_SETTING_KEY);
      value = nextValue;
      this.writes.push(nextValue);
      return nextValue;
    },
    value() {
      return value;
    }
  };
}

describe("user/client persistence settings", () => {
  it("registers one structured user layout setting and only renderer preferences as client settings", () => {
    const layout = settingDefinition(USER_LAYOUT_SETTING_KEY);

    expect(layout).toBeDefined();
    expect(layout.config.scope).toBe("user");
    expect(layout.config.type).toBe(Object);
    expect(layout.config.default).toEqual(DEFAULT_USER_LAYOUT);

    const clientKeys = SETTING_DEFINITIONS
      .filter(({ config }) => config.scope === "client")
      .map(({ key }) => key);
    expect(clientKeys).toEqual(["renderQuality", "maxDevicePixelRatio"]);
    expect(SETTING_DEFINITIONS
      .filter(({ config }) => config.scope === "user")
      .map(({ key }) => key)).toEqual([USER_LAYOUT_SETTING_KEY]);
  });

  it("loads validated defaults when the user setting is absent or corrupt", () => {
    const absent = new PersistenceService({ settings: makeSettings(undefined) });
    expect(absent.initialize()).toEqual(DEFAULT_USER_LAYOUT);

    const corrupt = new PersistenceService({ settings: makeSettings({ scenes: "not-a-map" }) });
    expect(corrupt.initialize()).toEqual(DEFAULT_USER_LAYOUT);
  });
});

describe("user layout migrations", () => {
  const v1Fixture = {
    schemaVersion: 1,
    defaultPanelCount: 3,
    linkSelection: false,
    linkCenter: true,
    linkZoom: false,
    safeExtension: "preserve-me",
    scenes: {
      "scene-a": {
        lastUsed: 12,
        panelCount: 2,
        views: ["not-a-view", "north"],
        splitterProportions: [0.7, 0.3],
        pan: { x: 99, y: 101 },
        customSafeField: "also-preserve"
      }
    }
  };

  it("migrates a v1 fixture to the current schema and repairs invalid views", () => {
    const migrated = migrateUserLayout(v1Fixture);

    expect(migrated.schemaVersion).toBe(CURRENT_LAYOUT_SCHEMA_VERSION);
    expect(migrated.safeExtension).toBe("preserve-me");
    expect(migrated.defaults).toEqual({
      panelCount: 3,
      linkSelection: false,
      linkCenter: true,
      linkZoom: false
    });
    expect(migrated.scenes["scene-a"]).toMatchObject({
      panelCount: 2,
      panels: [{ view: "top" }, { view: "north" }, { view: "iso-ne" }, { view: "west" }],
      splits: [0.7, 0.3],
      customSafeField: "also-preserve"
    });
    expect(migrated.scenes["scene-a"].pan).toBeUndefined();
    expect(migrated.scenes["scene-a"].overlays).toEqual(DEFAULT_OVERLAYS);
  });

  it("is idempotent and does not retain transient center/scale data", () => {
    const first = migrateUserLayout(v1Fixture);
    const second = migrateUserLayout(first);

    expect(second).toEqual(first);
    expect(second.scenes["scene-a"].center).toBeUndefined();
    expect(second.scenes["scene-a"].scale).toBeUndefined();
  });

  it("falls back only the corrupt Scene entry while retaining healthy entries", () => {
    const layout = migrateUserLayout({
      schemaVersion: 2,
      scenes: {
        healthy: { panelCount: 2, panels: [{ view: "east" }] },
        corrupt: null
      }
    });

    expect(layout.scenes.healthy.panels[0].view).toBe("east");
    expect(layout.scenes.corrupt).toBeUndefined();

    const service = new PersistenceService({
      settings: makeSettings({
        schemaVersion: 2,
        scenes: {
          healthy: { panelCount: 2, panels: [{ view: "east" }] },
          corrupt: { panels: "broken" }
        }
      })
    });
    service.initialize();
    expect(service.getSceneLayout("healthy").panels[0].view).toBe("east");
    expect(service.getSceneLayout("corrupt").panels[0].view).toBe("top");
    expect(service.getAllSceneLayouts()).toHaveProperty("healthy");
  });

  it("prunes the least recently used layouts at the documented bound", () => {
    const scenes = Object.fromEntries(Array.from(
      { length: MAX_SCENE_LAYOUTS + 2 },
      (_, index) => [`scene-${index}`, { lastUsed: index, panels: [{ view: "top" }] }]
    ));

    const pruned = pruneSceneLayouts(scenes);

    expect(Object.keys(pruned)).toHaveLength(MAX_SCENE_LAYOUTS);
    expect(pruned["scene-0"]).toBeUndefined();
    expect(pruned["scene-1"]).toBeUndefined();
    expect(pruned[`scene-${MAX_SCENE_LAYOUTS + 1}`]).toBeDefined();
  });
});

describe("user-local persistence service", () => {
  it("keeps two users' fake settings independent", async () => {
    const userASettings = makeSettings(undefined);
    const userBSettings = makeSettings(undefined);
    const userA = new PersistenceService({ settings: userASettings });
    const userB = new PersistenceService({ settings: userBSettings });

    userA.initialize();
    userB.initialize();
    await userA.saveSceneLayout("scene-a", {
      panelCount: 4,
      panels: [{ view: "west" }]
    }, { lastUsed: 100 });

    expect(userA.getSceneLayout("scene-a").panels[0].view).toBe("west");
    expect(userB.getSceneLayout("scene-a").panels[0].view).toBe("top");
    expect(userB.getPreferences()).toEqual(DEFAULT_USER_LAYOUT);
  });
});
