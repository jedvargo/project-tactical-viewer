import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptsRoot = fileURLToPath(new URL("../../scripts", import.meta.url));

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? javascriptFiles(path)
      : entry.name.endsWith(".js") ? [path] : [];
  });
}

function runtimeDependencies(path) {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/(?:from\s+|import\s*\()(["'])(\.\.?\/[^"']+)\1/g)]
    .map(([, , specifier]) => {
      const resolved = join(dirname(path), specifier.endsWith(".js") ? specifier : `${specifier}.js`);
      return resolved;
    });
}

describe("Prompt 30 runtime architecture", () => {
  it("reaches every runtime module from the single main entrypoint", () => {
    const files = javascriptFiles(scriptsRoot);
    const entrypoint = join(scriptsRoot, "main.js");
    const reachable = new Set();
    const visit = (path) => {
      if (reachable.has(path)) return;
      reachable.add(path);
      runtimeDependencies(path).forEach(visit);
    };
    visit(entrypoint);

    expect(files.filter((path) => !reachable.has(path)).map((path) => relative(scriptsRoot, path)))
      .toEqual([]);
  });

  it("keeps the runtime free of the development service attachment escape hatch", async () => {
    const { createRuntime } = await import("../../scripts/runtime.js");
    expect(createRuntime().attachService).toBeUndefined();
  });
});
