import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

import { buildRelease } from "./build-release.js";

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export async function verifyRelease() {
  const archive = buildRelease();
  const installDirectory = mkdtempSync(join(tmpdir(), "tactical-3d-viewer-install-"));
  try {
    execFileSync("unzip", ["-q", archive, "-d", installDirectory], { stdio: "inherit" });
    const manifestPath = join(installDirectory, "module.json");
    if (!existsSync(manifestPath)) throw new Error("Installed archive has no root module.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.id !== "tactical-3d-viewer") throw new Error("Installed module ID is incorrect");
    for (const path of ["scripts/main.js", "styles/tactical-viewer.css", "lang/en.json"]) {
      if (!existsSync(join(installDirectory, path))) {
        throw new Error(`Installed release is missing ${path}`);
      }
    }
    const installedFiles = filesUnder(installDirectory).map((path) => path.slice(installDirectory.length + 1));
    const forbidden = new Set(["package.json", "package-lock.json"]);
    if (installedFiles.some((path) => forbidden.has(path)
      || path.startsWith("node_modules/")
      || path.startsWith("tests/")
      || path.startsWith("docs/")
      || path.startsWith("tools/"))) {
      throw new Error("Release contains a third-party/runtime dependency");
    }
    await import(pathToFileURL(join(installDirectory, manifest.esmodules[0])).href);
    return { archive, installDirectory, files: installedFiles };
  } finally {
    rmSync(installDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await verifyRelease();
}
