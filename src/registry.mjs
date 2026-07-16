import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function loadRegistry(registryPath = defaultRegistryPath()) {
  const absoluteRegistryPath = path.resolve(registryPath);
  const raw = await fs.readFile(absoluteRegistryPath, "utf8");
  const registry = JSON.parse(raw);
  if (registry.schema !== "stewaird.registry.v0") {
    throw new Error(`Unsupported registry schema: ${registry.schema}`);
  }
  if (!Array.isArray(registry.projects)) {
    throw new Error("Registry projects must be an array.");
  }
  const baseDir = path.resolve(path.dirname(absoluteRegistryPath), "..");
  return {
    ...registry,
    registryPath: absoluteRegistryPath,
    baseDir,
    projects: registry.projects.map((project) => ({
      ...project,
      absolutePath: path.resolve(baseDir, project.path),
      codexThread: normalizeCodexThread(project.codexThread),
    })),
  };
}

export async function inspectRegistry(registryPath = defaultRegistryPath()) {
  const registry = await loadRegistry(registryPath);
  const projects = [];
  for (const project of orderProjects(registry)) {
    projects.push(await inspectProject(project));
  }
  return { ...registry, projects };
}

export function orderProjects(registry) {
  const byId = new Map(registry.projects.map((project) => [project.id, project]));
  const order = Array.isArray(registry.dependencyOrder) ? registry.dependencyOrder : [];
  const seen = new Set();
  const ordered = [];

  for (const id of order) {
    const project = byId.get(id);
    if (project) {
      ordered.push(project);
      seen.add(id);
    }
  }

  const remaining = registry.projects
    .filter((project) => !seen.has(project.id))
    .sort((a, b) => (a.dependencyTier ?? 999) - (b.dependencyTier ?? 999) || a.id.localeCompare(b.id));
  return ordered.concat(remaining);
}

export async function inspectProject(project) {
  const exists = await pathExists(project.absolutePath);
  const git = exists ? await gitStatus(project.absolutePath) : { isRepo: false, dirty: false, status: [] };
  const documents = {};
  for (const section of ["statusDocuments", "architectureDocuments", "maintainerDocuments", "agentInstructions", "arcsDocuments", "yaimlDocuments"]) {
    documents[section] = await inspectDocuments(project.absolutePath, project[section] ?? []);
  }

  return {
    ...project,
    exists,
    git,
    documents,
    interfaceEvidence: await inspectInterfaceEvidence(project),
    readinessLabel: assessReadiness(project, git, documents),
    summary: summarizeProject(project, exists, git, documents),
  };
}

export function buildStatusReport(inspected) {
  const lines = [
    "# StewAIrd Consolidated Status",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Dependency Order",
    "",
    ...orderProjects(inspected).map((project, index) => `${index + 1}. ${project.name} (${project.id})`),
    "",
    "## Projects",
    "",
  ];

  for (const project of inspected.projects) {
    lines.push(`### ${project.name}`);
    lines.push("");
    lines.push(`- Kind: ${project.kind}`);
    lines.push(`- Path: ${project.absolutePath}`);
    lines.push(`- Exists: ${project.exists ? "yes" : "no"}`);
    lines.push(`- Git: ${project.git.isRepo ? (project.git.dirty ? "dirty" : "clean") : "not a git repo"}`);
    lines.push(`- Depends on: ${formatList(project.dependsOn)}`);
    lines.push(`- Produces: ${formatList(project.capabilities?.produces)}`);
    lines.push(`- Consumes: ${formatList(project.capabilities?.consumes)}`);
    lines.push(`- Codex task: ${formatCodexThread(project.codexThread)}`);
    lines.push(`- Readiness: ${project.readinessLabel}`);
    lines.push(`- Status docs: ${formatDocuments(project.documents.statusDocuments)}`);
    lines.push(`- Agent/YAIML docs: ${formatDocuments([...(project.documents.agentInstructions ?? []), ...(project.documents.yaimlDocuments ?? []), ...(project.documents.arcsDocuments ?? [])])}`);
    lines.push(`- Interface evidence: ${formatEvidence(project.interfaceEvidence)}`);
    if (project.summary) {
      lines.push(`- Read: ${project.summary}`);
    }
    if (project.git.status.length) {
      lines.push("- Dirty working tree entries:");
      for (const entry of project.git.status.slice(0, 12)) {
        lines.push(`  - ${entry}`);
      }
      if (project.git.status.length > 12) {
        lines.push(`  - ... ${project.git.status.length - 12} more`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function buildCapabilityMap(inspected) {
  const capabilities = new Map();
  for (const project of inspected.projects) {
    for (const produced of project.capabilities?.produces ?? []) {
      const item = capabilities.get(produced) ?? { id: produced, producers: [], consumers: [] };
      item.producers.push(project.id);
      capabilities.set(produced, item);
    }
    for (const consumed of project.capabilities?.consumes ?? []) {
      const item = capabilities.get(consumed) ?? { id: consumed, producers: [], consumers: [] };
      item.consumers.push(project.id);
      capabilities.set(consumed, item);
    }
  }

  const sorted = [...capabilities.values()].sort((a, b) => a.id.localeCompare(b.id));
  const shared = sorted.filter((capability) => (capability.consumers.length + capability.producers.length) > 1);
  const lines = [
    "# StewAIrd Capability Map",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Shared Capabilities",
    "",
  ];

  for (const capability of shared) {
    lines.push(`### ${capability.id}`);
    lines.push("");
    lines.push(`- Producers: ${formatList(capability.producers)}`);
    lines.push(`- Consumers: ${formatList(capability.consumers)}`);
    lines.push("");
  }

  lines.push("## All Capabilities", "");
  for (const capability of sorted) {
    lines.push(`- ${capability.id}: produced by ${formatList(capability.producers)}; consumed by ${formatList(capability.consumers)}`);
  }

  return lines.join("\n");
}

export function buildCodexTaskMap(inspected) {
  const projects = orderProjects(inspected);
  const mapped = projects.filter((project) => project.codexThread?.threadId);
  const unmapped = projects.filter((project) => !project.codexThread?.threadId);
  const mismatched = mapped.filter((project) => project.codexThread.cwd && path.resolve(project.codexThread.cwd) !== project.absolutePath);

  const lines = [
    "# StewAIrd Codex Task Map",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This report maps registered repositories to known Codex tasks. It is routing compatibility data only: missing entries are unmapped, and mapped entries still need current git/YAIML inspection before work.",
    "",
    "## Summary",
    "",
    `- Registered projects: ${projects.length}`,
    `- Mapped tasks: ${mapped.length}`,
    `- Unmapped projects: ${unmapped.length}`,
    `- CWD mismatches: ${mismatched.length}`,
    "",
    "## Mapped Tasks",
    "",
  ];

  if (!mapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of mapped) {
      lines.push(`### ${project.name}`);
      lines.push("");
      lines.push(`- Project ID: ${project.id}`);
      lines.push(`- Path: ${project.absolutePath}`);
      lines.push(`- Git: ${project.git?.isRepo ? (project.git.dirty ? "dirty" : "clean") : "not a git repo"}`);
      lines.push(`- Codex task: ${formatCodexThread(project.codexThread)}`);
      lines.push(`- Codex cwd: ${project.codexThread.cwd || "not recorded"}`);
      lines.push(`- CWD check: ${project.codexThread.cwd ? (path.resolve(project.codexThread.cwd) === project.absolutePath ? "matches registry path" : "mismatch") : "not recorded"}`);
      lines.push(`- Validation: ${formatValidation(project.validation)}`);
      lines.push("");
    }
  }

  lines.push("## Unmapped Projects", "");
  if (!unmapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of unmapped) {
      lines.push(`- ${project.name} (${project.id}): ${project.absolutePath}`);
    }
    lines.push("");
  }

  if (mismatched.length) {
    lines.push("## CWD Mismatches", "");
    for (const project of mismatched) {
      lines.push(`- ${project.name} (${project.id}): registry path ${project.absolutePath}; task cwd ${project.codexThread.cwd}`);
    }
    lines.push("");
  }

  lines.push("## Dispatch Rule", "");
  lines.push("StewAIrd should hand reasoning-heavy work to mapped Codex tasks, one repository at a time or with explicit bounded concurrency. The CLI does not message Codex tasks directly; Codex app tooling performs the actual send using this routing evidence.");

  return lines.join("\n");
}

export async function writeOutputs(inspected, outputDir = path.resolve(path.dirname(defaultRegistryPath()), "..", "output")) {
  await fs.mkdir(outputDir, { recursive: true });

  const status = buildStatusReport(inspected);
  const capabilityMap = buildCapabilityMap(inspected);
  const codexTaskMap = buildCodexTaskMap(inspected);
  await fs.writeFile(path.join(outputDir, "project-status.md"), status, "utf8");
  await fs.writeFile(path.join(outputDir, "capability-map.md"), capabilityMap, "utf8");
  await fs.writeFile(path.join(outputDir, "codex-task-map.md"), codexTaskMap, "utf8");

  return {
    statusPath: path.join(outputDir, "project-status.md"),
    capabilityMapPath: path.join(outputDir, "capability-map.md"),
    codexTaskMapPath: path.join(outputDir, "codex-task-map.md"),
  };
}

async function inspectInterfaceEvidence(project) {
  const evidence = [];
  for (const item of project.interfaceEvidence ?? []) {
    const paths = [];
    for (const relativePath of item.paths ?? []) {
      const absolutePath = path.resolve(project.absolutePath, relativePath);
      paths.push({
        path: relativePath,
        exists: await pathExists(absolutePath),
      });
    }
    evidence.push({ ...item, paths });
  }
  return evidence;
}

async function inspectDocuments(root, docs) {
  const out = [];
  for (const relative of docs) {
    const absolute = path.resolve(root, relative);
    const exists = await pathExists(absolute);
    out.push({
      path: relative,
      exists,
      heading: exists ? await firstHeading(absolute) : "",
    });
  }
  return out;
}

async function firstHeading(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const line = raw.split(/\r?\n/).find((item) => /^#\s+/.test(item));
  return line ? line.replace(/^#\s+/, "").trim() : "";
}

async function gitStatus(root) {
  if (!(await pathExists(path.join(root, ".git")))) {
    return { isRepo: false, dirty: false, status: [] };
  }
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "status", "--short"], { timeout: 8000 });
    const status = stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { isRepo: true, dirty: status.length > 0, status };
  } catch (error) {
    return { isRepo: true, dirty: true, status: [`git status failed: ${error.message}`] };
  }
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function summarizeProject(project, exists, git, documents) {
  const foundStatus = documents.statusDocuments?.filter((doc) => doc.exists).map((doc) => doc.path) ?? [];
  const dirtyText = git.isRepo ? (git.dirty ? "dirty working tree" : "clean working tree") : "no git repository";
  const docText = foundStatus.length ? `status evidence in ${foundStatus.join(", ")}` : "no status document registered";
  return `${docText}; ${dirtyText}.`;
}

function assessReadiness(project, git, documents) {
  if (!documents.statusDocuments?.some((doc) => doc.exists)) {
    return "needs-state-doc";
  }
  if (git.isRepo && git.dirty) {
    return "inspect-before-change";
  }
  if ((project.interfaceEvidence ?? []).length > 0) {
    return "compare-before-extract";
  }
  return "read-only-candidate";
}

function formatList(items = []) {
  return items.length ? items.join(", ") : "none";
}

function formatDocuments(docs = []) {
  if (!docs.length) {
    return "none";
  }
  return docs.map((doc) => `${doc.path}${doc.exists ? "" : " (missing)"}`).join(", ");
}

function formatEvidence(evidence = []) {
  if (!evidence.length) {
    return "none";
  }
  return evidence.map((item) => {
    const paths = (item.paths ?? []).map((pathInfo) => `${pathInfo.path}${pathInfo.exists ? "" : " (missing)"}`).join(", ");
    return `${item.capability}/${item.role}: ${paths || "no paths"}`;
  }).join("; ");
}

function formatValidation(validation = []) {
  if (!validation.length) {
    return "none";
  }
  return validation.map((item) => {
    if (typeof item === "string") {
      return item;
    }
    const command = item.command ?? "manual";
    return item.cwd ? `${command} (cwd: ${item.cwd})` : command;
  }).join("; ");
}

function normalizeCodexThread(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    threadId: value.threadId ? String(value.threadId) : "",
    hostId: value.hostId ? String(value.hostId) : "",
    title: value.title ? String(value.title) : "",
    cwd: value.cwd ? String(value.cwd) : "",
  };
}

function formatCodexThread(thread) {
  if (!thread?.threadId) {
    return "unmapped";
  }
  const host = thread.hostId ? `${thread.hostId}/` : "";
  const title = thread.title ? ` (${thread.title})` : "";
  return `${host}${thread.threadId}${title}`;
}

function defaultRegistryPath() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "registry", "projects.json");
}
