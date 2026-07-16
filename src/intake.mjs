import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const docGroups = Object.freeze({
  statusDocs: [
    "SOT.md",
    "SoT.md",
    "STATUS.md",
    "docs/SoTA.md",
    "STATE_OF_THE_UNION.md",
    "docs/SoTY.md",
    "docs/state-of-the-table.md",
    "docs/STATE_OF_PROJECT.md",
    "docs/STATE_OF_THE_PROJECT.md",
  ],
  architectureDocs: [
    "ARCHITECTURE.md",
    "docs/ARCHITECTURE.md",
  ],
  maintainerDocs: [
    "MAINTAINER_GUIDE.md",
    "docs/MAINTAINER_GUIDE.md",
  ],
  agentDocs: [
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
  ],
  arcsDocs: [
    "arcs.yml",
    "arcs.yaml",
  ],
  yaimlDocs: [
    "yaiml.yml",
    "yaiml.yaml",
  ],
});

const packageManifests = Object.freeze([
  "package.json",
  "go.mod",
  "pyproject.toml",
  "Cargo.toml",
]);

export async function scanFolders(paths) {
  const uniquePaths = uniqueAbsolutePaths(paths);
  const projects = [];
  for (const folderPath of uniquePaths) {
    projects.push(await scanFolder(folderPath));
  }
  return {
    selectedCount: uniquePaths.length,
    projects,
    aggregate: aggregateTokens(projects, uniquePaths.length),
  };
}

export async function scanFolder(folderPath) {
  const absolutePath = path.resolve(folderPath);
  const name = path.basename(absolutePath);
  const exists = await isDirectory(absolutePath);

  if (!exists) {
    return emptyToken({
      name,
      absolutePath,
      warnings: ["Folder does not exist or is not a directory."],
    });
  }

  const documents = {};
  const yaimlCandidateDocs = await findDocs(absolutePath, docGroups.yaimlDocs);
  const temporaryArcsCandidateDocs = await findDocs(absolutePath, docGroups.arcsDocs);
  const yaimlText = await readFirstExisting(absolutePath, yaimlCandidateDocs);
  const temporaryArcsText = yaimlText ? "" : await readFirstExisting(absolutePath, temporaryArcsCandidateDocs);
  const manifestText = yaimlText || temporaryArcsText;
  const declaredDocs = parseArcsDocumentPaths(manifestText);
  for (const [group, candidates] of Object.entries(docGroups)) {
    const expanded = [...candidates, ...(declaredDocs[group] ?? [])];
    documents[group] = await findDocs(absolutePath, uniqueStrings(expanded));
  }

  const manifests = await findDocs(absolutePath, packageManifests);
  const packageManifestText = await readFirstExisting(absolutePath, manifests);
  const statusText = await readFirstExisting(absolutePath, documents.statusDocs);
  const projectName = detectProjectName({
    folderName: name,
    yaimlText: manifestText,
    manifestText: packageManifestText,
  });

  const isGitRepo = await pathExists(path.join(absolutePath, ".git"));
  const git = isGitRepo
    ? await gitStatus(absolutePath)
    : { dirty: false, status: [] };

  const isYaimlAware = documents.yaimlDocs.some((doc) => doc.exists) || hasYaimlFrontMatter(statusText);
  const isTemporaryArcsAware = !isYaimlAware && (documents.arcsDocs.some((doc) => doc.exists) || hasArcsFrontMatter(statusText));
  const capabilityHints = inferCapabilityHints(`${manifestText}\n${statusText}\n${packageManifestText}`);
  const warnings = buildWarnings({
    isGitRepo,
    isYaimlAware,
    isTemporaryArcsAware,
    isLegacyYaimlAware: isTemporaryArcsAware,
    statusDocs: documents.statusDocs,
    maintainerDocs: documents.maintainerDocs,
  });

  return {
    id: slug(projectName || name),
    name: projectName || name,
    absolutePath,
    exists: true,
    isGitRepo,
    gitDirty: git.dirty,
    dirtySample: git.status.slice(0, 8),
    isArcsAware: isTemporaryArcsAware,
    isTemporaryArcsAware,
    isLegacyYaimlAware: isTemporaryArcsAware,
    isYaimlAware,
    statusDocs: documents.statusDocs,
    architectureDocs: documents.architectureDocs,
    maintainerDocs: documents.maintainerDocs,
    agentDocs: documents.agentDocs,
    arcsDocs: documents.arcsDocs,
    yaimlDocs: documents.yaimlDocs,
    packageManifests: manifests,
    capabilityHints,
    dependencyHints: inferDependencyHints(manifestText),
    warnings,
  };
}

export function aggregateTokens(projects, selectedCount = projects.length) {
  const capabilityCounts = {};
  for (const project of projects) {
    for (const hint of project.capabilityHints ?? []) {
      capabilityCounts[hint] = (capabilityCounts[hint] ?? 0) + 1;
    }
  }

  return {
    selectedCount,
    existingCount: projects.filter((project) => project.exists).length,
    arcsAwareCount: projects.filter((project) => project.isTemporaryArcsAware).length,
    temporaryArcsAwareCount: projects.filter((project) => project.isTemporaryArcsAware).length,
    legacyYaimlAwareCount: projects.filter((project) => project.isTemporaryArcsAware).length,
    yaimlAwareCount: projects.filter((project) => project.isYaimlAware).length,
    dirtyCount: projects.filter((project) => project.gitDirty).length,
    missingStateDocCount: projects.filter((project) => !hasExisting(project.statusDocs)).length,
    missingMaintainerDocCount: projects.filter((project) => !hasExisting(project.maintainerDocs)).length,
    warningCount: projects.reduce((count, project) => count + (project.warnings?.length ?? 0), 0),
    capabilityCounts,
  };
}

function emptyToken({ name, absolutePath, warnings }) {
  return {
    id: slug(name),
    name,
    absolutePath,
    exists: false,
    isGitRepo: false,
    gitDirty: false,
    dirtySample: [],
    isYaimlAware: false,
    statusDocs: [],
    architectureDocs: [],
    maintainerDocs: [],
    agentDocs: [],
    arcsDocs: [],
    yaimlDocs: [],
    packageManifests: [],
    capabilityHints: [],
    dependencyHints: [],
    warnings,
  };
}

async function findDocs(root, candidates) {
  const docs = [];
  const seenExisting = new Set();
  for (const relativePath of candidates) {
    const absolutePath = path.join(root, relativePath);
    const exists = await pathExists(absolutePath);
    if (exists) {
      const real = await realPathKey(absolutePath);
      if (seenExisting.has(real)) {
        continue;
      }
      seenExisting.add(real);
    }
    docs.push({
      path: relativePath,
      exists,
      heading: exists ? await firstHeading(absolutePath) : "",
    });
  }
  return docs;
}

async function realPathKey(targetPath) {
  try {
    return (await fs.realpath(targetPath)).toLowerCase();
  } catch {
    return targetPath.toLowerCase();
  }
}

async function readFirstExisting(root, docs) {
  const found = docs.find((doc) => doc.exists);
  if (!found) {
    return "";
  }
  try {
    const raw = await fs.readFile(path.join(root, found.path), "utf8");
    return raw.slice(0, 120000);
  } catch {
    return "";
  }
}

function detectProjectName({ folderName, yaimlText, manifestText }) {
  const nestedName = yaimlText.match(/^\s*project:\s*\r?\n(?:[ \t]+[^\r\n]*\r?\n)*?[ \t]+name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
  if (nestedName) {
    return nestedName;
  }

  const yaimlName = yaimlText.match(/^\s*project:[ \t]*["']?([^"'\r\n]+)["']?[ \t]*$/m)?.[1]?.trim();
  if (yaimlName) {
    return yaimlName;
  }

  try {
    const parsed = JSON.parse(manifestText);
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
  } catch {
    // Non-JSON manifests are expected for Go, Rust, and Python projects.
  }

  const goModule = manifestText.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1]?.trim();
  if (goModule) {
    return path.basename(goModule);
  }

  return folderName;
}

function parseArcsDocumentPaths(arcsText) {
  const docs = {
    statusDocs: [],
    architectureDocs: [],
    maintainerDocs: [],
    agentDocs: [],
    yaimlDocs: [],
  };

  const roleMap = {
    sot: "statusDocs",
    status: "statusDocs",
    state: "statusDocs",
    architecture: "architectureDocs",
    maintainer: "maintainerDocs",
    agents: "agentDocs",
    agent: "agentDocs",
  };

  for (const match of arcsText.matchAll(/^\s{2,}([a-zA-Z0-9_-]+):\s*\r?\n\s{4,}path:\s*["']?([^"'\r\n]+)["']?\s*$/gm)) {
    const group = roleMap[match[1].toLowerCase()];
    if (group) {
      docs[group].push(match[2].trim());
    }
  }

  return docs;
}

function inferCapabilityHints(text) {
  const hints = new Set();
  const lower = text.toLowerCase();
  if (/yaiml|arcs|state of|state-of|sot\.md/.test(lower)) {
    hints.add("yaiml-project-memory");
  }
  if (/provider|ollama|openai|chat completions|model provider/.test(lower)) {
    hints.add("provider-adapter");
  }
  if (/structured|json|schema|contract|patch operation|validation/.test(lower)) {
    hints.add("structured-output");
  }
  if (/approval|review|accept|reject|human|use anyway/.test(lower)) {
    hints.add("human-approval");
  }
  if (/screen|capture|workflow|macro|rpa/.test(lower)) {
    hints.add("screen-workflow");
  }
  if (/tts|ffmpeg|video|image prompt|voiceover|captions/.test(lower)) {
    hints.add("media-generation");
  }
  return [...hints].sort();
}

function inferDependencyHints(yaimlText) {
  const hints = [];
  for (const match of yaimlText.matchAll(/^\s*read-with:\s*(.+)$/gmi)) {
    hints.push(match[1].trim());
  }
  return hints;
}

function buildWarnings({ isGitRepo, isYaimlAware, isTemporaryArcsAware, statusDocs, maintainerDocs }) {
  const warnings = [];
  if (!isGitRepo) {
    warnings.push("No .git directory detected.");
  }
  if (!isYaimlAware && !isTemporaryArcsAware) {
    warnings.push("No YAIML index or temporary ARCS-style state front matter detected.");
  }
  if (!hasExisting(statusDocs)) {
    warnings.push("No state/status document detected.");
  }
  if (!hasExisting(maintainerDocs)) {
    warnings.push("No maintainer guide detected.");
  }
  return warnings;
}

async function gitStatus(root) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "status", "--short"], { timeout: 8000 });
    const status = stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { dirty: status.length > 0, status };
  } catch (error) {
    return {
      dirty: true,
      status: [`git status failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function firstHeading(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const line = raw.split(/\r?\n/).find((item) => /^#\s+/.test(item));
    return line ? line.replace(/^#\s+/, "").trim() : "";
  } catch {
    return "";
  }
}

async function isDirectory(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function hasExisting(docs = []) {
  return docs.some((doc) => doc.exists);
}

function hasYaimlFrontMatter(text) {
  return /^---\s*\r?\nyaiml:\s*/i.test(text.trimStart());
}

function hasArcsFrontMatter(text) {
  return /^---\s*\r?\narcs:\s*/i.test(text.trimStart());
}

function uniqueAbsolutePaths(paths) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(paths) ? paths : []) {
    if (typeof item !== "string" || !item.trim()) {
      continue;
    }
    const absolutePath = path.resolve(item.trim());
    const key = absolutePath.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(absolutePath);
    }
  }
  return out;
}

function uniqueStrings(items) {
  return [...new Set(items.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

function slug(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "project";
}
