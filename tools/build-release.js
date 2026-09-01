import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RELEASE_DIRECTORY = join(ROOT, "dist");
const RELEASE_INPUTS = Object.freeze(["module.json", "README.md", "lang", "scripts", "styles", "assets"]);

// Keep the archive root in Foundry's expected form: module.json is at `/`.
export function buildRelease({ root = ROOT, outputDirectory = RELEASE_DIRECTORY } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
  const staging = mkdtempSync(join(tmpdir(), "tactical-3d-viewer-release-"));
  mkdirSync(outputDirectory, { recursive: true });
  const archive = join(outputDirectory, `${manifest.id}-${manifest.version}.zip`);

  try {
    for (const input of RELEASE_INPUTS) {
      const source = join(root, input);
      if (!existsSync(source)) throw new Error(`Release input is missing: ${input}`);
      cpSync(source, join(staging, input), { recursive: true });
    }
    if (existsSync(archive)) rmSync(archive, { force: true });
    execFileSync("zip", ["-q", "-r", archive, "."], { cwd: staging, stdio: "inherit" });
    return archive;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  buildRelease();
}
