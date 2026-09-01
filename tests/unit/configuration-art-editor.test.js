import { describe, expect, it, vi } from "vitest";

import {
  applyFilePickerResult,
  attachFilePickerToInput,
  buildAdvancedArtEditorContent,
  editAdvancedArtConfiguration
} from "../../scripts/configuration/art-editor.js";
import { MODULE_ID, VIEW_DEFINITIONS } from "../../scripts/constants.js";

describe("advanced tactical art editor", () => {
  it("renders all nine fixed view slots and the non-view options", () => {
    const content = buildAdvancedArtEditorContent({
      icon: "icons/ship.webp",
      forwardOffset: 15,
      mirror: { northSouth: true, eastWest: false },
      views: {}
    });

    expect(content).toContain("data-role=\"tactical-art-editor\"");
    expect(content).toContain(`name=\"flags.${MODULE_ID}.art.forwardOffset\"`);
    expect(content).toContain(`name=\"flags.${MODULE_ID}.art.mirror.northSouth\"`);
    for (const { id } of VIEW_DEFINITIONS) {
      expect(content).toContain(`name=\"flags.${MODULE_ID}.art.views.${id}\"`);
    }
  });

  it("maps a File Picker callback to the intended form field", () => {
    const input = { value: "" };
    expect(applyFilePickerResult(input, "public/ships/queen.webp")).toBe("public/ships/queen.webp");
    expect(input.value).toBe("public/ships/queen.webp");
  });

  it("passes image selection back through the same input field", async () => {
    const input = { value: "" };
    class Picker {
      constructor(options) { this.options = options; }
      render() { this.options.callback("public/ships/selected.webp"); }
    }

    expect(attachFilePickerToInput({ input, filePickerClass: Picker })).toBe(true);
    expect(input.value).toBe("public/ships/selected.webp");
  });

  it("serializes the advanced editor result without writing until the caller commits", async () => {
    const input = vi.fn(async (options) => {
      expect(options.content).toContain(`flags.${MODULE_ID}.art.views.iso-nw`);
      return {
        [`flags.${MODULE_ID}.art.forwardOffset`]: "30",
        [`flags.${MODULE_ID}.art.mirror.northSouth`]: "on",
        [`flags.${MODULE_ID}.art.mirror.eastWest`]: "",
        [`flags.${MODULE_ID}.art.views.top`]: "icons/top.webp"
      };
    });

    const result = await editAdvancedArtConfiguration({
      art: { preset: "generic-ship", icon: "", forwardOffset: 0, mirror: {}, views: {} },
      dialogInput: input
    });

    expect(result).toMatchObject({
      forwardOffset: 30,
      mirror: { northSouth: true, eastWest: false },
      views: { top: "icons/top.webp" }
    });
  });

  it("allows an advanced editor mirror checkbox to be turned off", async () => {
    const result = await editAdvancedArtConfiguration({
      art: {
        preset: "generic-ship",
        icon: "",
        forwardOffset: 0,
        mirror: { northSouth: true, eastWest: true },
        views: {}
      },
      dialogInput: async () => ({})
    });

    expect(result.mirror).toEqual({ northSouth: false, eastWest: false });
  });
});
