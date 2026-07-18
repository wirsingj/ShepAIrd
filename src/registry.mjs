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
      codexProject: normalizeCodexProject(project.codexProject),
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
    lines.push(`- Codex Project: ${formatCodexProject(project.codexProject)}`);
    lines.push(`- Codex task: ${formatCodexThread(project.codexThread)}`);
    lines.push(`- Codex route: ${codexRouteHealth(project).label}`);
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
  const projectMapped = projects.filter((project) => project.codexProject?.projectId);
  const projectUnmapped = projects.filter((project) => !project.codexProject?.projectId);
  const projectMismatched = projectMapped.filter((project) => codexProjectPathCheck(project).status === "mismatch");
  const mapped = projects.filter((project) => project.codexThread?.threadId);
  const unmapped = projects.filter((project) => !project.codexThread?.threadId);
  const mismatched = mapped.filter((project) => taskPathCheck(project).status === "mismatch");
  const ready = projects.filter((project) => codexRouteHealth(project).status === "ready");
  const needsProject = projects.filter((project) => codexRouteHealth(project).status === "needs-project");
  const needsTouchpoint = projects.filter((project) => codexRouteHealth(project).status === "needs-touchpoint");
  const setupNeeded = projects.filter((project) => codexRouteHealth(project).status !== "ready");

  const lines = [
    "# StewAIrd Codex Route Map",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This report maps registered repositories to Codex Projects and known touchpoint tasks. It is routing compatibility data only: missing entries are unmapped, and mapped entries still need current git/YAIML inspection before work.",
    "",
    "## Summary",
    "",
    `- Registered projects: ${projects.length}`,
    `- Codex Projects mapped: ${projectMapped.length}`,
    `- Codex Projects missing: ${projectUnmapped.length}`,
    `- Codex Project path mismatches: ${projectMismatched.length}`,
    `- Mapped tasks: ${mapped.length}`,
    `- Unmapped projects: ${unmapped.length}`,
    `- CWD mismatches: ${mismatched.length}`,
    `- Ready routes: ${ready.length}`,
    `- Needs Codex Project: ${needsProject.length}`,
    `- Has Project but needs touchpoint task: ${needsTouchpoint.length}`,
    `- Touchpoint tasks missing total: ${unmapped.length}`,
    "",
    "## Ready Routes",
    "",
  ];

  if (!ready.length) {
    lines.push("- none", "");
  } else {
    for (const project of ready) {
      lines.push(`- ${project.name} (${project.id}): ${project.codexProject.label || project.codexProject.projectId} -> ${project.codexThread.title || project.codexThread.threadId}`);
    }
    lines.push("");
  }

  lines.push("## Mapped Projects", "");
  if (!projectMapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of projectMapped) {
      lines.push(`### ${project.name}`);
      lines.push("");
      lines.push(`- Registry ID: ${project.id}`);
      lines.push(`- Path: ${project.absolutePath}`);
      lines.push(`- Codex Project: ${formatCodexProject(project.codexProject)}`);
      lines.push(`- Codex Project path: ${project.codexProject.path || "not recorded"}`);
      lines.push(`- Project route check: ${codexProjectPathCheck(project).label}`);
      lines.push(`- Touchpoint task: ${formatCodexThread(project.codexThread)}`);
      lines.push(`- Route health: ${codexRouteHealth(project).label}`);
      lines.push("");
    }
  }

  lines.push("## Mapped Touchpoint Tasks", "");

  if (!mapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of mapped) {
      lines.push(`### ${project.name}`);
      lines.push("");
      lines.push(`- Registry ID: ${project.id}`);
      lines.push(`- Path: ${project.absolutePath}`);
      lines.push(`- Git: ${project.git?.isRepo ? (project.git.dirty ? "dirty" : "clean") : "not a git repo"}`);
      lines.push(`- Codex Project: ${formatCodexProject(project.codexProject)}`);
      lines.push(`- Codex task: ${formatCodexThread(project.codexThread)}`);
      lines.push(`- Codex cwd: ${project.codexThread.cwd || "not recorded"}`);
      if (project.codexThread.scopePath) {
        lines.push(`- Task scope: ${project.codexThread.scopePath}`);
      }
      lines.push(`- Project route check: ${codexProjectPathCheck(project).label}`);
      lines.push(`- Route check: ${taskPathCheck(project).label}`);
      lines.push(`- Route health: ${codexRouteHealth(project).label}`);
      lines.push(`- Validation: ${formatValidation(project.validation)}`);
      lines.push("");
    }
  }

  lines.push("## Missing Codex Projects", "");
  if (!projectUnmapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of projectUnmapped) {
      lines.push(`- ${project.name} (${project.id}): ${project.absolutePath}`);
    }
    lines.push("");
  }

  lines.push("## Missing Touchpoint Tasks", "");
  if (!unmapped.length) {
    lines.push("- none", "");
  } else {
    for (const project of unmapped) {
      lines.push(`- ${project.name} (${project.id}): ${project.absolutePath}`);
    }
    lines.push("");
  }

  lines.push("## Setup Needed", "");
  if (!setupNeeded.length) {
    lines.push("- none", "");
  } else {
    for (const project of setupNeeded) {
      const health = codexRouteHealth(project);
      if (health.status === "needs-project") {
        lines.push(`- ${project.name} (${project.id}): create or open a saved repo-root Codex Project for ${project.absolutePath}, then create one durable touchpoint task inside that Project.`);
      } else if (health.status === "needs-touchpoint") {
        lines.push(`- ${project.name} (${project.id}): create one durable touchpoint task inside the saved Codex Project ${project.codexProject.label || project.codexProject.projectId}.`);
      } else {
        lines.push(`- ${project.name} (${project.id}): resolve ${health.label}.`);
      }
    }
    lines.push("");
  }

  if (projectMismatched.length) {
    lines.push("## Codex Project Path Mismatches", "");
    for (const project of projectMismatched) {
      const route = codexProjectPathCheck(project);
      lines.push(`- ${project.name} (${project.id}): registry path ${project.absolutePath}; Codex Project path ${project.codexProject.path || "not recorded"}; ${route.label}`);
    }
    lines.push("");
  }

  if (mismatched.length) {
    lines.push("## CWD Mismatches", "");
    for (const project of mismatched) {
      const route = taskPathCheck(project);
      lines.push(`- ${project.name} (${project.id}): registry path ${project.absolutePath}; task cwd ${project.codexThread.cwd || "not recorded"}; scope ${project.codexThread.scopePath || "not recorded"}; ${route.label}`);
    }
    lines.push("");
  }

  lines.push("## Dispatch Rule", "");
  lines.push("StewAIrd should hand reasoning-heavy work to touchpoint tasks inside repo-root Codex Projects, one repository at a time or with explicit bounded concurrency. If a registered repo has no saved Codex Project, report it as needing setup instead of silently creating a task under the parent git workspace. The CLI does not message Codex tasks directly; Codex app tooling performs the actual send using this routing evidence.");

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
    scopePath: value.scopePath ? String(value.scopePath) : "",
  };
}

function normalizeCodexProject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    projectId: value.projectId ? String(value.projectId) : "",
    hostId: value.hostId ? String(value.hostId) : "",
    label: value.label ? String(value.label) : "",
    path: value.path ? String(value.path) : "",
    kind: value.kind ? String(value.kind) : "",
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

function formatCodexProject(project) {
  if (!project?.projectId) {
    return "unmapped";
  }
  const host = project.hostId ? `${project.hostId}/` : "";
  const label = project.label ? ` (${project.label})` : "";
  return `${host}${project.projectId}${label}`;
}

function codexProjectPathCheck(project) {
  if (!project.codexProject?.projectId) {
    return { status: "unmapped", label: "Codex Project unmapped" };
  }
  if (!project.codexProject.path) {
    return { status: "unknown", label: "Codex Project path not recorded" };
  }
  return path.resolve(project.codexProject.path) === project.absolutePath
    ? { status: "ok", label: "Codex Project path matches registry path" }
    : { status: "mismatch", label: "Codex Project path mismatch" };
}

function codexRouteHealth(project) {
  const projectCheck = codexProjectPathCheck(project);
  const taskCheck = taskPathCheck(project);
  if (projectCheck.status === "mismatch" || taskCheck.status === "mismatch") {
    return { status: "mismatch", label: "route mismatch" };
  }
  if (!project.codexProject?.projectId) {
    return { status: "needs-project", label: "needs Codex Project" };
  }
  if (!project.codexThread?.threadId) {
    return { status: "needs-touchpoint", label: "needs touchpoint task" };
  }
  if (projectCheck.status === "ok" && taskCheck.status === "ok") {
    return { status: "ready", label: "ready" };
  }
  return { status: "unknown", label: "route incomplete" };
}

function taskPathCheck(project) {
  if (!project.codexThread?.threadId) {
    return { status: "unmapped", label: "unmapped" };
  }
  if (project.codexThread.scopePath) {
    const resolvedScope = path.resolve(project.codexThread.scopePath);
    if (resolvedScope !== project.absolutePath) {
      return { status: "mismatch", label: "scope path mismatch" };
    }
    if (project.codexThread.cwd && !isSameOrChildPath(path.resolve(project.codexThread.cwd), resolvedScope)) {
      return { status: "mismatch", label: "scope path matches registry path but is outside task cwd" };
    }
    return {
      status: "ok",
      label: project.codexThread.cwd
        ? "scope path matches registry path inside task cwd"
        : "scope path matches registry path",
    };
  }
  if (project.codexThread.cwd) {
    return path.resolve(project.codexThread.cwd) === project.absolutePath
      ? { status: "ok", label: "cwd matches registry path" }
      : { status: "mismatch", label: "cwd mismatch" };
  }
  return { status: "unknown", label: "task path not recorded" };
}

function isSameOrChildPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultRegistryPath() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "registry", "projects.json");
}
