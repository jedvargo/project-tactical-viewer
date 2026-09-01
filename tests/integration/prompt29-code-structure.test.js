import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory()
      ? javascriptFiles(path)
      : entry.name.endsWith(".js") ? [path] : [];
  });
}

describe("Prompt 29 production code structure", () => {
  it("keeps TokenDocument.update as the sole TokenDocument write boundary", () => {
    const scriptsDirectory = fileURLToPath(new URL("../../scripts/", import.meta.url));
    const outsideUpdateService = javascriptFiles(scriptsDirectory)
      .filter((path) => !path.endsWith("/tactical-update-service.js"))
      .filter((path) => /(?:TokenDocument|document)\.update\s*\(/.test(readFileSync(path, "utf8")));

    expect(outsideUpdateService).toEqual([]);
  });

  it("does not depend on legacy private document ids or production logging", () => {
    const scriptsDirectory = fileURLToPath(new URL("../../scripts/", import.meta.url));
    const source = javascriptFiles(scriptsDirectory)
      .filter((path) => !path.endsWith("/tactical-viewer-application.js"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/\._id\b/);
    expect(source).not.toMatch(/\bconsole\s*\./);
    expect(source).not.toMatch(/getDebugMetrics|debugMetrics/);
  });
});
