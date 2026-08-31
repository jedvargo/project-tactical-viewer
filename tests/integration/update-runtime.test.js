import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createModuleApi, createRuntime } from "../../scripts/runtime.js";

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory()
      ? javascriptFiles(path)
      : entry.name.endsWith(".js") ? [path] : [];
  });
}

describe("runtime tactical update boundary", () => {
  it("exposes the single TacticalUpdateService and its write operations", () => {
    const runtime = createRuntime();
    const api = createModuleApi(runtime);
    const service = api.getTacticalUpdateService();

    expect(service).toBe(runtime.getService("tacticalUpdate"));
    expect(api.moveXY).toBeTypeOf("function");
    expect(api.moveXZ).toBeTypeOf("function");
    expect(api.moveYZ).toBeTypeOf("function");
    expect(api.setHeading).toBeTypeOf("function");
    expect(api.setPitch).toBeTypeOf("function");
  });

  it("keeps direct document update calls inside TacticalUpdateService", () => {
    const scriptsDirectory = fileURLToPath(new URL("../../scripts/", import.meta.url));
    const updateCallOutsideService = javascriptFiles(scriptsDirectory)
      .filter((path) => !path.endsWith("/tactical-update-service.js"))
      .filter((path) => /\.update\s*\(/.test(readFileSync(path, "utf8")));

    expect(updateCallOutsideService).toEqual([]);
  });
});
