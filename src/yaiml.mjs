import { promises as fs } from "node:fs";
import path from "node:path";

// Preserve established root discovery when both layouts exist. Never merge maps.
export const YAIML_MANIFEST_PATHS = Object.freeze([
  "yaiml.yml", "yaiml.yaml", ".yaiml/yaiml.yml", ".yaiml/yaiml.yaml",
]);
export const ARCS_MANIFEST_PATHS = Object.freeze(["arcs.yml", "arcs.yaml"]);

export async function readMemoryManifest(root) {
  const yaiml = await firstFile(root, YAIML_MANIFEST_PATHS);
  const arcs = await firstFile(root, ARCS_MANIFEST_PATHS);
  const manifest = yaiml || arcs;
  const manifestPath = manifest ? path.resolve(root, manifest) : "";
  return {
    manifest,
    manifestPath,
    hasYaiml: Boolean(yaiml),
    hasTemporaryArcs: Boolean(arcs),
    temporaryArcs: !yaiml && Boolean(arcs),
    legacy: !yaiml && Boolean(arcs),
    raw: manifest ? await fs.readFile(manifestPath, "utf8") : "",
  };
}

// Consumers join these portable, repository-relative paths to the repository root.
export function resolveMemoryDocuments(manifest, documents) {
  const directory = path.posix.dirname(manifest);
  return Object.fromEntries(Object.entries(documents).map(([role, paths]) => [
    role,
    [...new Set(paths.map((relative) => path.posix.join(directory, relative.replaceAll("\\", "/"))))],
  ]));
}

async function firstFile(root, candidates) {
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(path.join(root, candidate))).isFile()) return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  return "";
}
