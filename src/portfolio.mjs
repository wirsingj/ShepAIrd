import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { loadRegistry, orderProjects } from "./registry.mjs";

const execFileAsync = promisify(execFile);

export const CAMPAIGN_LENSES = Object.freeze({
  yaiml: {
    id: "yaiml",
    title: "YAIML Compliance And State Drift",
    aliases: ["yaiml", "project memory", "state docs", "sot"],
    objective: "Check repository YAIML memory against current implementation and update only verified project truth.",
    focus: ["manifest and stable headers", "stale current-state claims", "portable-memory hygiene", "validation evidence", "repo-specific risks and priorities"],
  },
  security: {
    id: "security",
    title: "Security Audit",
    aliases: ["security", "secrets", "privacy", "permissions", "threat"],
    objective: "Find security, privacy, permission, secret-handling, and unsafe-surface risks that matter for this repository.",
    focus: ["secret and credential exposure", "permissions and host access", "generated-content or provider trust boundaries", "local file and network surfaces", "release/package safety"],
  },
  performance: {
    id: "performance",
    title: "Performance Pass",
    aliases: ["performance", "perf", "speed", "latency", "memory", "slow"],
    objective: "Find likely runtime, build, rendering, polling, packaging, or engine performance risks.",
    focus: ["hot paths and loops", "rendering or capture cost", "build and package size", "polling and async work", "large generated artifacts"],
  },
  "bug-check": {
    id: "bug-check",
    title: "Bug-Risk Review",
    aliases: ["bug", "bugs", "bug-check", "defect", "regression", "correctness", "code-pattern", "code-patterns", "code patterns"],
    objective: "Find likely defects, risky code patterns, stale state, edge cases, race conditions, and missing regression coverage.",
    focus: ["failed or brittle validation", "risky code patterns", "edge cases", "state/race behavior", "stale assumptions", "missing regression tests"],
  },
  architecture: {
    id: "architecture",
    title: "Architecture Drift Review",
    aliases: ["architecture", "architectural", "design drift", "boundaries", "abstraction"],
    objective: "Check whether implementation boundaries still match the repository's architecture and YAIML invariants.",
    focus: ["module ownership", "provider/model seams", "overgrown controllers", "cross-boundary leakage", "documented invariants"],
  },
  readability: {
    id: "readability",
    title: "Code Readability Pass",
    aliases: ["readability", "cleanup", "clarity", "simplify", "maintainability"],
    objective: "Improve obvious readability and maintainability issues without broad refactors or behavior drift.",
    focus: ["confusing naming", "local duplication", "dense control flow", "missing orienting comments", "docs that help future agents"],
  },
  "release-readiness": {
    id: "release-readiness",
    title: "Release Readiness Review",
    aliases: ["release", "shipping", "prod", "production", "marketplace", "steam"],
    objective: "Check build/package/release posture, version drift, manual QA, and shipped artifact boundaries.",
    focus: ["version metadata", "package scripts", "release docs", "manual QA gates", "generated artifacts and store posture"],
  },
  "test-coverage": {
    id: "test-coverage",
    title: "Test Coverage Review",
    aliases: ["test coverage", "tests", "coverage", "qa"],
    objective: "Find high-risk behavior without sufficient automated or manual validation.",
    focus: ["missing tests around danger zones", "brittle tests", "manual-only risks", "validation command gaps", "regression candidates"],
  },
  "docs-drift": {
    id: "docs-drift",
    title: "Documentation Drift Review",
    aliases: ["docs", "documentation", "readme", "drift"],
    objective: "Find disagreements between README, YAIML, maintainer docs, release docs, and implementation reality.",
    focus: ["README claims", "YAIML current state", "maintainer commands", "architecture boundaries", "release or setup docs"],
  },
});

export const PORTFOLIO_MODES = Object.freeze({
  inspect: "inspect",
  plan: "plan",
  validate: "validate",
  apply: "apply",
});

export async function runPortfolioCommand(commandText, options = {}) {
  const command = interpretPortfolioCommand(commandText, options);
  const registry = await loadRegistry(options.registryPath);
  const workspaceRoot = path.resolve(registry.baseDir, registry.workspaceRoot ?? "..");
  const outputRoot = options.outputRoot ?? path.resolve(registry.baseDir, "output");
  const runRecordDir = options.outputDir ?? path.join(outputRoot, "runs");
  const previousRun = await readLatestRunRecord(runRecordDir);
  const previousRepos = new Map((previousRun?.repositories ?? []).map((repo) => [repo.id, { ...repo, runId: previousRun.id }]));
  const discoveries = await discoverWorkspaceRepos(workspaceRoot);
  const reconciliation = reconcileWorkspace(registry, discoveries);
  const selected = selectProjects(registry, reconciliation, command);
  const ordered = orderSelectedProjects(registry, selected);
  const run = {
    id: makeRunId(options.now ?? new Date()),
    command: commandText,
    mode: command.mode,
    action: command.action,
    campaignLens: command.campaignLens,
    stepLimit: command.stepLimit,
    resume: command.resume,
    workspaceRoot,
    selectedRepositories: ordered.map((project) => project.id),
    repositoryOrder: ordered.map((project) => project.id),
    startedAt: (options.now ?? new Date()).toISOString(),
    executor: "direct-filesystem-command-executor",
    previousRun: previousRun
      ? { id: previousRun.id, finishedAt: previousRun.finishedAt ?? "", command: previousRun.command ?? "" }
      : null,
    repositories: [],
    reconciliation,
  };

  const blockedIds = new Set();
  const dependencyBlockersEnabled = !(command.action === "campaign-handoff" && typeof options.handoffDispatcher !== "function");
  for (const project of ordered) {
    const previousRepo = previousRepos.get(project.id);
    if (command.resume && shouldResumeSkip(command, previousRun, previousRepo)) {
      run.repositories.push({
        id: project.id,
        name: project.name,
        path: project.absolutePath,
        mode: command.mode,
        action: command.action,
        status: "skipped",
        blockers: [],
        filesChanged: [],
        validation: [],
        notes: [`Already ${previousRepo.status} in previous run ${previousRun.id}; skipped for resume.`],
      });
      continue;
    }
    const blockedDependency = (project.dependsOn ?? []).find((id) => blockedIds.has(id));
    if (dependencyBlockersEnabled && blockedDependency) {
      run.repositories.push({
        id: project.id,
        name: project.name,
        path: project.absolutePath,
        mode: command.mode,
        action: command.action,
        status: "skipped",
        blockers: [`dependency ${blockedDependency} blocked earlier in this run`],
        filesChanged: [],
        validation: [],
      });
      continue;
    }

    const result = await processRepository(project, command, options);
    result.sincePreviousRun = compareRepositorySnapshot(result, previousRepos.get(project.id));
    run.repositories.push(result);
    if (result.status === "blocked" || result.status === "failed") {
      blockedIds.add(project.id);
    }
  }

  run.finishedAt = (options.now ?? new Date()).toISOString();
  run.summary = summarizeRun(run);

  if (options.record !== false) {
    run.recordPaths = await writeRunRecord(run, options.outputDir ?? path.join(outputRoot, "runs"));
  }

  return run;
}

export function interpretPortfolioCommand(commandText, options = {}) {
  const raw = String(commandText ?? "").trim();
  const lower = raw.toLowerCase();
  const explicitMode = options.mode?.toLowerCase();
  const campaignLens = inferCampaignLens(lower, options.lens);
  const mode = explicitMode && Object.values(PORTFOLIO_MODES).includes(explicitMode)
    ? explicitMode
    : inferMode(lower, campaignLens);
  const stepLimit = Number.isInteger(options.steps)
    ? options.steps
    : inferStepLimit(lower);
  const action = inferAction(lower, mode, campaignLens);

  return {
    text: raw,
    mode,
    action,
    campaignLens,
    stepLimit,
    resume: Boolean(options.resume) || /\bresume\b/i.test(raw),
    targetIds: parseTargetIds(raw, options.targets),
    includeDiscovered: Boolean(options.includeDiscovered),
  };
}

export async function discoverWorkspaceRepos(workspaceRoot) {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const absolutePath = path.join(workspaceRoot, entry.name);
    if (await pathExists(path.join(absolutePath, ".git"))) {
      repos.push({
        name: entry.name,
        id: slug(entry.name),
        absolutePath,
        relativePath: path.relative(path.resolve(workspaceRoot, "StewAIrd"), absolutePath) || ".",
      });
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function reconcileWorkspace(registry, discoveries) {
  const byPath = new Map(discoveries.map((repo) => [normalizePath(repo.absolutePath), repo]));
  const byName = new Map(discoveries.map((repo) => [repo.name.toLowerCase(), repo]));
  const managed = [];
  const missing = [];
  const moved = [];

  for (const project of registry.projects) {
    const matchByPath = byPath.get(normalizePath(project.absolutePath));
    const matchByName = byName.get(project.name?.toLowerCase?.() ?? "");
    const lifecycle = project.lifecycle ?? "active";
    const policy = project.managed === false ? "excluded" : "managed";
    if (matchByPath || normalizePath(project.absolutePath) === normalizePath(registry.baseDir)) {
      managed.push({ id: project.id, state: policy, lifecycle, path: project.absolutePath });
    } else if (matchByName) {
      moved.push({
        id: project.id,
        state: policy,
        lifecycle,
        configuredPath: project.absolutePath,
        discoveredPath: matchByName.absolutePath,
      });
    } else {
      missing.push({ id: project.id, state: "missing", lifecycle, configuredPath: project.absolutePath });
    }
  }

  const registeredPaths = new Set(registry.projects.map((project) => normalizePath(project.absolutePath)));
  const discovered = discoveries
    .filter((repo) => !registeredPaths.has(normalizePath(repo.absolutePath)))
    .map((repo) => ({ id: repo.id, state: "discovered", path: repo.absolutePath }));

  return { managed, moved, missing, discovered };
}

export async function readYaimlDocset(root) {
  const yaimlPath = path.join(root, "yaiml.yml");
  const temporaryArcsPath = path.join(root, "arcs.yml");
  const hasYaiml = await pathExists(yaimlPath);
  const hasTemporaryArcs = await pathExists(temporaryArcsPath);
  const manifestPath = hasYaiml ? yaimlPath : hasTemporaryArcs ? temporaryArcsPath : "";
  const raw = manifestPath ? await fs.readFile(manifestPath, "utf8") : "";
  const documents = parseManifestDocuments(raw);
  return {
    manifest: manifestPath ? path.basename(manifestPath) : "",
    manifestPath,
    temporaryArcs: !hasYaiml && hasTemporaryArcs,
    legacy: !hasYaiml && hasTemporaryArcs,
    hasYaiml,
    hasTemporaryArcs,
    raw,
    statusDocuments: documents.statusDocuments,
    architectureDocuments: documents.architectureDocuments,
    maintainerDocuments: documents.maintainerDocuments,
    supportingDocuments: documents.supportingDocuments,
  };
}

export async function processRepository(project, command, options = {}) {
  const result = {
    id: project.id,
    name: project.name,
    path: project.absolutePath,
    mode: command.mode,
    action: command.action,
    status: "completed",
    filesChanged: [],
    validation: [],
    blockers: [],
    skipped: [],
    notes: [],
  };

  if (!(await pathExists(project.absolutePath))) {
    return { ...result, status: "blocked", blockers: ["configured repository path does not exist"] };
  }

  const gitBefore = await gitStatus(project.absolutePath);
  result.gitBefore = gitBefore;
  const docset = await readYaimlDocset(project.absolutePath);
  result.yaiml = summarizeDocset(docset);
  result.arcs = result.yaiml;

  if (command.mode === PORTFOLIO_MODES.inspect) {
    result.status = "inspected";
    result.nextStep = recommendNextStep(project, docset, gitBefore);
    return result;
  }

  if (command.mode === PORTFOLIO_MODES.plan) {
    result.status = "planned";
    result.nextStep = recommendNextStep(project, docset, gitBefore);
    if (command.campaignLens) {
      const fileSignals = await collectFileSignals(project.absolutePath);
      const contentSignals = await collectContentSignals(project.absolutePath, docset, command.campaignLens);
      result.campaignHandoff = buildCampaignHandoff(project, docset, gitBefore, command.campaignLens, fileSignals, {
        contentSignals,
        requestedFixes: /\b(fix|correct|repair|resolve|address)\b/i.test(command.text),
      });
      result.notes.push(`Prepared ephemeral ${CAMPAIGN_LENSES[command.campaignLens].title} Codex handoff context.`);
    }
    return result;
  }

  if (command.mode === PORTFOLIO_MODES.validate) {
    result.validation = await runValidation(project, options);
    result.status = result.validation.some((item) => item.status === "failed" || item.status === "blocked")
      ? "failed"
      : "completed";
    if (result.status === "failed") {
      result.blockers.push("One or more validation commands failed or were blocked.");
    }
    result.gitAfter = await gitStatus(project.absolutePath);
    return result;
  }

  if (command.action === "temporary-arcs-cleanup") {
    await applyTemporaryArcsCleanup(project.absolutePath, docset, result);
  } else if (command.action === "continue-yaiml-checklist") {
    await applyOneContinuationStep(project, docset, result, options);
  } else if (command.campaignLens) {
    const fileSignals = await collectFileSignals(project.absolutePath);
    const contentSignals = await collectContentSignals(project.absolutePath, docset, command.campaignLens);
    result.campaignHandoff = buildCampaignHandoff(project, docset, gitBefore, command.campaignLens, fileSignals, {
      contentSignals,
      requestedFixes: /\b(fix|correct|repair|resolve|address)\b/i.test(command.text),
    });
    if (typeof options.handoffDispatcher !== "function") {
      result.status = "blocked";
      result.blockers.push(`Campaign lens '${command.campaignLens}' requires Codex repo-chat handoff execution; no handoff dispatcher is configured.`);
      result.gitAfter = await gitStatus(project.absolutePath);
      return result;
    }
    const dispatch = await options.handoffDispatcher({
      project,
      command,
      handoff: result.campaignHandoff,
    });
    result.status = "dispatched";
    result.handoff = {
      status: dispatch?.status ?? "sent",
      target: dispatch?.target ?? dispatch?.threadId ?? "",
      note: dispatch?.note ?? "",
    };
    result.notes.push("Sent campaign handoff to Codex repo context; downstream audit/fix work is not completed by this local run.");
    result.gitAfter = await gitStatus(project.absolutePath);
    return result;
  } else {
    result.status = "blocked";
    result.blockers.push(`No direct executor exists for action '${command.action}'.`);
  }

  result.validation = await runValidation(project, options);
  if (result.status === "completed" && result.validation.some((item) => item.status === "failed" || item.status === "blocked")) {
    result.status = "failed";
    result.blockers.push("One or more validation commands failed or were blocked.");
  }
  result.gitAfter = await gitStatus(project.absolutePath);
  return result;
}

export function buildPortfolioReport(run) {
  const lines = [
    "# StewAIrd Portfolio Run",
    "",
    `Run: ${run.id}`,
    `Mode: ${run.mode}`,
    `Action: ${run.action}`,
    run.campaignLens ? `Campaign lens: ${run.campaignLens}` : "",
    `Command: ${run.command}`,
    `Workspace: ${run.workspaceRoot}`,
    "",
    "## Summary",
    "",
    `- Completed: ${run.summary.completed}`,
    `- Dispatched: ${run.summary.dispatched}`,
    `- Inspected: ${run.summary.inspected}`,
    `- Planned: ${run.summary.planned}`,
    `- Blocked: ${run.summary.blocked}`,
    `- Failed: ${run.summary.failed}`,
    `- Skipped: ${run.summary.skipped}`,
    "",
    "## Repository Results",
    "",
  ].filter(Boolean);

  for (const repo of run.repositories) {
    lines.push(`### ${repo.name}`);
    lines.push("");
    lines.push(`- Status: ${repo.status}`);
    lines.push(`- Action: ${repo.action}`);
    lines.push(`- Path: ${repo.path}`);
    if (repo.gitBefore) {
      lines.push(`- Git: ${formatGitSnapshot(repo.gitBefore)}`);
    }
    if (repo.sincePreviousRun) {
      lines.push(`- Since previous run: ${formatSnapshotComparison(repo.sincePreviousRun)}`);
    }
    lines.push(`- YAIML manifest: ${repo.yaiml?.manifest ?? repo.arcs?.manifest ?? "none"}`);
    if (repo.nextStep) {
      lines.push(`- Next step: ${repo.nextStep}`);
    }
    if (repo.campaignHandoff) {
      lines.push(`- Campaign objective: ${repo.campaignHandoff.objective}`);
      lines.push(`- Codex handoff: ${repo.campaignHandoff.command}`);
      lines.push(`- Audit surfaces: ${repo.campaignHandoff.auditSurfaces.slice(0, 6).join("; ")}`);
    }
    if (repo.handoff?.status) {
      lines.push(`- Handoff: ${repo.handoff.status}${repo.handoff.target ? ` (${repo.handoff.target})` : ""}`);
    }
    if (repo.filesChanged?.length) {
      lines.push(`- Files changed: ${repo.filesChanged.join(", ")}`);
    }
    if (repo.validation?.length) {
      lines.push(`- Validation: ${repo.validation.map((item) => `${formatValidationLabel(item)} => ${item.status}`).join("; ")}`);
    }
    if (repo.blockers?.length) {
      lines.push(`- Blockers: ${repo.blockers.join("; ")}`);
    }
    if (repo.notes?.length) {
      lines.push(`- Notes: ${repo.notes.join("; ")}`);
    }
    lines.push("");
  }

  lines.push("## Reconciliation", "");
  lines.push(`- Managed registry entries: ${run.reconciliation.managed.length}`);
  lines.push(`- Discovered unregistered repos: ${run.reconciliation.discovered.length}`);
  lines.push(`- Missing registry entries: ${run.reconciliation.missing.length}`);
  lines.push(`- Possible moves: ${run.reconciliation.moved.length}`);
  return lines.join("\n");
}

async function applyTemporaryArcsCleanup(root, docset, result) {
  if (!docset.hasTemporaryArcs) {
    result.status = "completed";
    result.notes.push("No temporary-only arcs.yml manifest found.");
    return;
  }
  if (docset.hasYaiml) {
    result.status = "blocked";
    result.blockers.push("Both yaiml.yml and arcs.yml exist; manual reconciliation is required.");
    return;
  }
  const oldPath = path.join(root, "arcs.yml");
  const newPath = path.join(root, "yaiml.yml");
  const updated = migrateManifestText(docset.raw);
  await fs.writeFile(newPath, updated, "utf8");
  await fs.unlink(oldPath);
  result.filesChanged.push("yaiml.yml", "arcs.yml");
  result.notes.push("Renamed temporary arcs.yml discovery file to yaiml.yml.");
}

async function applyOneContinuationStep(project, docset, result) {
  if (!docset.manifest) {
    result.status = "blocked";
    result.blockers.push("No yaiml.yml or temporary arcs.yml manifest found; initialize or clean up YAIML first.");
    return;
  }
  const validation = project.validation ?? [];
  if (!validation.length) {
    result.status = "blocked";
    result.blockers.push("No validation command is registered, so StewAIrd cannot prove a safe continuation step yet.");
    return;
  }
  const stateDoc = docset.statusDocuments[0];
  if (!stateDoc) {
    result.status = "blocked";
    result.blockers.push("YAIML manifest does not declare a state/SoT document.");
    return;
  }
  await appendRunNote(path.join(project.absolutePath, stateDoc), {
    projectName: project.name,
    command: "continue-yaiml-checklist",
  });
  result.filesChanged.push(stateDoc);
  result.notes.push("Recorded one bounded StewAIrd continuation note in the repository state document.");
}

async function runValidation(project, options = {}) {
  const validations = [];
  for (const entry of project.validation ?? []) {
    const validation = normalizeValidationEntry(entry);
    if (!validation.command || validation.kind === "manual" || validation.command === "document review" || validation.command === "git status review") {
      validations.push({ ...validation, status: "recorded", stdout: "", stderr: "" });
      continue;
    }
    const parsed = parseShellWords(validation.command);
    if (!parsed.length) {
      continue;
    }
    if (isForbiddenCommand(parsed)) {
      validations.push({
        ...validation,
        status: "blocked",
        stdout: "",
        stderr: "Command requires separate explicit permission and cannot run as validation.",
      });
      continue;
    }
    try {
      const { stdout, stderr } = await execFileAsync(parsed[0], parsed.slice(1), {
        cwd: path.resolve(project.absolutePath, validation.cwd),
        timeout: options.validationTimeoutMs ?? 120000,
        windowsHide: true,
      });
      validations.push({
        ...validation,
        status: "passed",
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
      });
    } catch (error) {
      const stderr = error.stderr || error.message || String(error);
      validations.push({
        ...validation,
        status: "failed",
        stdout: sanitizeOutput(error.stdout ?? ""),
        stderr: sanitizeOutput(stderr),
      });
    }
  }
  return validations;
}

function inferCampaignLens(lower, explicitLens) {
  if (explicitLens) {
    const explicit = slug(explicitLens);
    return CAMPAIGN_LENSES[explicit] ? explicit : "";
  }
  let bestMatch = null;
  for (const lens of Object.values(CAMPAIGN_LENSES)) {
    for (const alias of lens.aliases) {
      const index = lower.indexOf(alias);
      if (index >= 0 && (!bestMatch || index < bestMatch.index)) {
        bestMatch = { id: lens.id, index };
      }
    }
  }
  return bestMatch?.id ?? "";
}

function inferMode(lower, campaignLens = "") {
  if (/^(apply|fix|continue|upgrade|initialize|run|clean)\b/.test(lower) || /\b(apply|fix|continue|upgrade|initialize|clean)\b/.test(lower)) {
    return PORTFOLIO_MODES.apply;
  }
  if (/^(validate|verify)\b/.test(lower) || /\b(validate|verification|validation-only)\b/.test(lower)) {
    return PORTFOLIO_MODES.validate;
  }
  if (/^(plan|prepare|generate work packets|show what)\b/.test(lower) || /\b(plan|would do|work packets)\b/.test(lower)) {
    return PORTFOLIO_MODES.plan;
  }
  if (campaignLens) {
    return PORTFOLIO_MODES.plan;
  }
  return PORTFOLIO_MODES.inspect;
}

function inferAction(lower, mode, campaignLens = "") {
  if (/\b(temporary arcs|arcs-to-yaiml|cleanup.*arcs|clean.*arcs|migrate.*arcs)\b/.test(lower)) {
    return "temporary-arcs-cleanup";
  }
  if (/\bcontinu(?:e|ing)\b|\byaiml checklist\b|\barcs checklist\b|\bnext safe step\b/.test(lower)) {
    return "continue-yaiml-checklist";
  }
  if (mode === PORTFOLIO_MODES.apply && campaignLens) {
    return "campaign-handoff";
  }
  if (mode === PORTFOLIO_MODES.inspect) {
    return "portfolio-inspection";
  }
  if (mode === PORTFOLIO_MODES.plan) {
    return "portfolio-plan";
  }
  if (mode === PORTFOLIO_MODES.validate) {
    return "portfolio-validation";
  }
  return "unsupported";
}

async function collectFileSignals(root) {
  const skipDirs = new Set([".git", "node_modules", "dist", "build", "out", "downloads", "coverage", ".next", ".vite"]);
  const interesting = [];
  const queue = [{ absolute: root, relative: "" }];
  const maxFiles = 350;
  let seen = 0;

  while (queue.length && seen < maxFiles) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(current.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = path.join(current.relative, entry.name).replaceAll("\\", "/");
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) {
          queue.push({ absolute, relative });
        }
        continue;
      }
      seen += 1;
      if (isInterestingFile(relative)) {
        interesting.push(relative);
      }
      if (seen >= maxFiles) {
        break;
      }
    }
  }

  const manifestSummaries = [];
  for (const relative of interesting.filter((item) => path.basename(item) === "package.json").slice(0, 4)) {
    const summary = await summarizePackageJson(path.join(root, relative), relative);
    if (summary) {
      manifestSummaries.push(summary);
    }
  }

  return {
    files: interesting.slice(0, 80),
    truncated: seen >= maxFiles,
    manifestSummaries,
  };
}

function isInterestingFile(relative) {
  const normalized = relative.replaceAll("\\", "/");
  const base = path.basename(normalized).toLowerCase();
  if ([
    "package.json",
    "go.mod",
    "project.godot",
    "docker-compose.yml",
    "docker-compose.yaml",
    "manifest.json",
    "manifest.chrome.json",
    "manifest.firefox.json",
    "vite.config.ts",
    "vite.config.js",
    "electron.vite.config.ts",
    "tsconfig.json",
    "security.md",
    "privacy.md",
    "release.md",
    "qa_checklist.md",
    "risk_review.md",
  ].includes(base)) {
    return true;
  }
  return normalized.startsWith(".github/workflows/")
    || normalized.startsWith("scripts/")
    || normalized.startsWith("tools/")
    || normalized.startsWith("tests/")
    || normalized.endsWith(".ps1")
    || normalized.endsWith(".cmd");
}

async function summarizePackageJson(filePath, relative) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
    const scripts = Object.keys(parsed.scripts ?? {});
    return scripts.length
      ? `${relative} scripts: ${scripts.slice(0, 12).join(", ")}${scripts.length > 12 ? ", ..." : ""}`
      : `${relative} has no scripts`;
  } catch {
    return `${relative} could not be parsed`;
  }
}

async function collectContentSignals(root, docset, lensId) {
  if (!["docs-drift", "yaiml"].includes(lensId)) {
    return [];
  }

  const signals = [];
  const declaredDocs = unique([
    ...docset.statusDocuments,
    ...docset.architectureDocuments,
    ...docset.maintainerDocuments,
    ...(docset.supportingDocuments ?? []),
  ]);

  for (const relative of declaredDocs) {
    const absolute = path.join(root, relative);
    if (!(await pathExists(absolute))) {
      signals.push(`Declared YAIML document missing: ${relative}`);
      continue;
    }
    const heading = await readFirstMarkdownHeading(absolute);
    signals.push(heading ? `Declared YAIML document present: ${relative} heading "${heading}"` : `Declared YAIML document present: ${relative} without top-level heading`);
  }

  const readme = await findFirstExisting(root, ["README.md", "Readme.md", "readme.md"]);
  if (readme) {
    const heading = await readFirstMarkdownHeading(path.join(root, readme));
    signals.push(heading ? `README present: ${readme} heading "${heading}"` : `README present: ${readme} without top-level heading`);
  } else if (lensId === "docs-drift") {
    signals.push("README not found at repository root");
  }

  const staleTermFiles = unique([readme, ...declaredDocs].filter(Boolean));
  for (const relative of staleTermFiles) {
    const terms = await findStaleTerms(path.join(root, relative));
    if (terms.length) {
      signals.push(`Potential stale terminology in ${relative}: ${terms.join(", ")}`);
    }
  }

  return signals.slice(0, 24);
}

async function readFirstMarkdownHeading(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const line = raw.split(/\r?\n/).find((item) => /^#\s+/.test(item));
    return line ? line.replace(/^#\s+/, "").trim().slice(0, 120) : "";
  } catch {
    return "";
  }
}

async function findFirstExisting(root, candidates) {
  for (const relative of candidates) {
    if (await pathExists(path.join(root, relative))) {
      return relative;
    }
  }
  return "";
}

async function findStaleTerms(filePath) {
  try {
    const raw = (await fs.readFile(filePath, "utf8")).slice(0, 20000);
    const patterns = [
      ["ARCS", /\bARCS\b/],
      ["arcs.yml", /\barcs\.yml\b/i],
      ["SoTA", /\bSoTA\b/],
      ["stored packet language", /\b(work packets?|campaign packets?|packet files?)\b/i],
    ];
    return patterns.filter(([, pattern]) => pattern.test(raw)).map(([label]) => label);
  } catch {
    return [];
  }
}

function buildCampaignHandoff(project, docset, git, lensId, fileSignals = { files: [], manifestSummaries: [] }, options = {}) {
  const lens = CAMPAIGN_LENSES[lensId];
  const contentSignals = options.contentSignals ?? [];
  const handoff = {
    lens: lens.id,
    title: lens.title,
    objective: lens.objective,
    command: `Run a ${lens.title.toLowerCase()} for ${project.name}; ${options.requestedFixes ? "fix safe bounded issues," : "report findings,"} run validation, and update affected YAIML docs when project truth changes.`,
    repositoryPath: project.absolutePath,
    codexProject: project.codexProject ?? null,
    codexThread: project.codexThread ?? null,
    routeGuard: buildCodexRouteGuard(project),
    git: formatGitSnapshot(git),
    yaimlDocuments: [
      ...docset.statusDocuments,
      ...docset.architectureDocuments,
      ...docset.maintainerDocuments,
      ...(docset.supportingDocuments ?? []),
    ],
    fileSignals,
    contentSignals,
    auditSurfaces: inferAuditSurfaces(project, docset, lens, fileSignals, contentSignals),
    safeFixBoundaries: buildSafeFixBoundaries(lens),
    validation: (project.validation ?? []).map((entry) => formatValidationLabel(normalizeValidationEntry(entry))),
    yaimlUpdateRule: "Update only affected YAIML documents when verified project truth, commands, risks, or priorities changed; prune stale claims instead of appending a work log.",
    humanBlockers: buildHumanBlockers(lens),
  };
  handoff.prompt = buildCampaignHandoffPrompt(project, handoff, options);
  return handoff;
}

function buildCampaignHandoffPrompt(project, handoff, options = {}) {
  return [
    `Run a ${handoff.title.toLowerCase()} for ${project.name}.`,
    "",
    `Repository: ${handoff.repositoryPath}`,
    `Objective: ${handoff.objective}`,
    `Fix safe bounded issues: ${options.requestedFixes ? "yes" : "no; report findings only unless already explicitly authorized"}`,
    "",
    "Routing guard:",
    ...formatPromptList(handoff.routeGuard),
    "",
    "Read first:",
    ...formatPromptList(handoff.yaimlDocuments),
    "",
    "Audit surfaces:",
    ...formatPromptList(handoff.auditSurfaces.slice(0, 16)),
    "",
    "Detected files:",
    ...formatPromptList(handoff.fileSignals.files.slice(0, 24)),
    handoff.fileSignals.truncated ? "- File scan was truncated; inspect the repo directly before concluding coverage." : "",
    "",
    "Shallow content signals:",
    ...formatPromptList(handoff.contentSignals),
    "",
    "Validation:",
    ...formatPromptList(handoff.validation),
    "",
    "Rules:",
    "- Preserve dirty/user work; do not reset, clean, publish, deploy, release, push, or commit unless separately authorized in that repo chat.",
    "- Use the repository's own YAIML docs as canonical project memory.",
    "- Update only affected YAIML docs when verified project truth, risks, commands, or priorities changed.",
    "- If you make code/docs changes, run the listed validation when practical and report any blocker precisely.",
    "- Block for human judgment on secrets, credentials, legal/privacy conclusions, release decisions, broad refactors, dependency/provider installs, or cross-repo moves.",
    "",
    "When done, summarize findings, changes, validation, remaining risks, and YAIML updates in that repo chat.",
  ].filter((line) => line !== "").join("\n");
}

function formatPromptList(items = []) {
  return items.length ? items.map((item) => `- ${item}`) : ["- none"];
}

function buildCodexRouteGuard(project) {
  const codexProject = project.codexProject;
  const thread = project.codexThread;
  const lines = [
    `Repository scope: ${project.absolutePath}`,
    "Work only inside the repository scope above.",
  ];
  if (!codexProject?.projectId) {
    lines.push("No saved repo-root Codex Project is recorded; prefer creating/using a repo-specific Project before durable dispatch.");
  } else {
    lines.push(`Codex Project: ${codexProject.hostId ? `${codexProject.hostId}/` : ""}${codexProject.projectId}${codexProject.label ? ` (${codexProject.label})` : ""}`);
    if (codexProject.path) {
      lines.push(`Codex Project path: ${codexProject.path}`);
      lines.push("Stop if the Codex Project path does not match the repository scope.");
    }
  }
  if (!thread?.threadId) {
    lines.push("No mapped touchpoint task is recorded; confirm or create the correct repo task before dispatching.");
    return lines;
  }
  lines.push(`Mapped touchpoint task: ${thread.hostId ? `${thread.hostId}/` : ""}${thread.threadId}${thread.title ? ` (${thread.title})` : ""}`);
  if (thread.cwd) {
    lines.push(`Task cwd: ${thread.cwd}`);
  }
  if (thread.scopePath) {
    lines.push(`Task scopePath: ${thread.scopePath}`);
    lines.push("This is a parent-workspace task; stop if the task scopePath does not match the repository scope.");
  } else {
    lines.push("This is a repo-root task; stop if the task cwd does not match the repository scope.");
  }
  return lines;
}

function inferAuditSurfaces(project, docset, lens, fileSignals = { files: [], manifestSummaries: [] }, contentSignals = []) {
  const surfaces = new Set();
  for (const doc of [...docset.statusDocuments, ...docset.architectureDocuments, ...docset.maintainerDocuments]) {
    surfaces.add(`YAIML core: ${doc}`);
  }
  for (const doc of project.agentInstructions ?? []) {
    surfaces.add(`Agent instructions: ${doc}`);
  }
  for (const item of project.interfaceEvidence ?? []) {
    for (const evidencePath of item.paths ?? []) {
      surfaces.add(`${item.capability}: ${evidencePath}`);
    }
  }
  for (const capability of project.capabilities?.produces ?? []) {
    surfaces.add(`Produced capability: ${capability}`);
  }
  for (const capability of project.capabilities?.consumes ?? []) {
    surfaces.add(`Consumed capability: ${capability}`);
  }
  for (const focus of lens.focus) {
    surfaces.add(`Lens focus: ${focus}`);
  }
  for (const summary of fileSignals.manifestSummaries ?? []) {
    surfaces.add(`Package manifest: ${summary}`);
  }
  for (const file of fileSignals.files ?? []) {
    if (isLensRelevantFile(file, lens.id)) {
      surfaces.add(`Detected file: ${file}`);
    }
  }
  for (const signal of contentSignals) {
    surfaces.add(`Shallow content signal: ${signal}`);
  }
  if (/browser-extension|extension/i.test(project.kind) || /extension/i.test(project.notes ?? "")) {
    surfaces.add("Extension manifests, permissions, content scripts, packaging, and store docs.");
  }
  if (/game|godot|unreal|prototype|vertical/i.test(project.kind)) {
    surfaces.add("Engine project files, gameplay loop, capture/build scripts, and manual playtest notes.");
  }
  if (/ai|provider|model|ollama|openai/i.test(`${project.kind} ${project.notes ?? ""} ${(project.capabilities?.consumes ?? []).join(" ")}`)) {
    surfaces.add("Provider/model boundary, prompt/output validation, API-key handling, and fallback behavior.");
  }
  return [...surfaces];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function isLensRelevantFile(file, lensId) {
  const lower = file.toLowerCase();
  if (lensId === "security") {
    return /security|privacy|risk|manifest|workflow|docker|\.ps1|\.cmd|scripts\//.test(lower);
  }
  if (lensId === "performance") {
    return /test|benchmark|capture|render|vite|electron|godot|package\.json|go\.mod/.test(lower);
  }
  if (lensId === "release-readiness") {
    return /release|qa|workflow|manifest|package|build|docker|steam/.test(lower);
  }
  if (lensId === "test-coverage" || lensId === "bug-check") {
    return /test|spec|qa|package\.json|go\.mod/.test(lower);
  }
  if (lensId === "docs-drift" || lensId === "yaiml") {
    return /readme|maintainer|architecture|sot|state|yaiml|release|security|privacy|risk/.test(lower);
  }
  return /package\.json|go\.mod|project\.godot|manifest|scripts|tests/.test(lower);
}

function buildSafeFixBoundaries(lens) {
  return [
    "Prefer small local fixes with existing validation.",
    "Do not move repositories, extract shared packages, publish, deploy, or release.",
    "Do not add dependencies or providers without explicit human approval.",
    "Do not overwrite repo-specific YAIML truth with generic checklist text.",
    `For ${lens.title}, block when the issue requires product, legal, credential, release, or broad architecture judgment.`,
  ];
}

function buildHumanBlockers(lens) {
  return [
    "Secrets, credentials, private data, legal/IP conclusions, release decisions, deployments, and publishing require human direction.",
    "Broad refactors, shared-package extraction, or cross-repo code moves require separate approval.",
    `${lens.title} findings should preserve evidence and uncertainty when implementation truth is mixed or incomplete.`,
  ];
}

function inferStepLimit(lower) {
  const nStep = lower.match(/\b(\d+)\s+(?:bounded\s+)?steps?\b/);
  if (nStep) {
    return Number.parseInt(nStep[1], 10);
  }
  const wordStep = lower.match(/\b(one|two|three|four|five)\s+(?:bounded\s+)?steps?\b/);
  if (wordStep) {
    return { one: 1, two: 2, three: 3, four: 4, five: 5 }[wordStep[1]];
  }
  return 1;
}

function parseTargetIds(raw, explicitTargets) {
  if (Array.isArray(explicitTargets) && explicitTargets.length) {
    return explicitTargets.map((item) => slug(item));
  }
  const leadingContinue = raw.match(/^continue\s+(.+?)\s+for\b/i);
  if (leadingContinue && !/\b(all|every|each)\b/i.test(leadingContinue[1])) {
    return leadingContinue[1].replace(/\s+and\s+/g, ",").split(",").map((item) => slug(item)).filter(Boolean);
  }
  const match = raw.match(/\b(?:for|in)\s+([A-Z][A-Za-z0-9_-]*(?:\s*,\s*[A-Z][A-Za-z0-9_-]*)*(?:\s+and\s+[A-Z][A-Za-z0-9_-]*)?)/);
  if (!match) {
    return [];
  }
  return match[1].replace(/\s+and\s+/g, ",").split(",").map((item) => slug(item)).filter(Boolean);
}

function selectProjects(registry, reconciliation, command) {
  const targetIds = new Set(command.targetIds);
  return registry.projects.filter((project) => {
    if (project.managed === false || project.lifecycle === "archived" || project.lifecycle === "inactive") {
      return false;
    }
    if (targetIds.size) {
      return targetIds.has(project.id) || targetIds.has(slug(project.name));
    }
    return reconciliation.managed.some((item) => item.id === project.id && item.state === "managed");
  });
}

function orderSelectedProjects(registry, selected) {
  const selectedIds = new Set(selected.map((project) => project.id));
  return orderProjects({ ...registry, projects: registry.projects.filter((project) => selectedIds.has(project.id)) });
}

function recommendNextStep(project, docset, git) {
  if (!docset.manifest) {
    return "Initialize YAIML or clean up temporary ARCS files before repository-specific continuation.";
  }
  if (docset.temporaryArcs) {
    return "Migrate temporary arcs.yml discovery back to yaiml.yml.";
  }
  if (git.dirty) {
    return "Inspect dirty worktree and isolate user changes before applying a bounded step.";
  }
  if ((project.validation ?? []).length) {
    return `Run validation (${formatValidationList(project.validation)}) and update YAIML if truth changed.`;
  }
  return "Read YAIML state and choose one bounded repository-specific step.";
}

function formatValidationList(validations) {
  return validations.map((entry) => formatValidationLabel(normalizeValidationEntry(entry))).join("; ");
}

function parseManifestDocuments(raw) {
  const docs = {
    statusDocuments: [],
    architectureDocuments: [],
    maintainerDocuments: [],
    supportingDocuments: [],
  };
  const roleMap = {
    sot: "statusDocuments",
    status: "statusDocuments",
    state: "statusDocuments",
    architecture: "architectureDocuments",
    maintainer: "maintainerDocuments",
  };
  for (const match of raw.matchAll(/^\s{2,}([a-zA-Z0-9_-]+):\s*\r?\n(?:\s{4,}[^\r\n]*\r?\n)*?\s{4,}path:\s*["']?([^"'\r\n]+)["']?\s*$/gm)) {
    const group = roleMap[match[1].toLowerCase()];
    if (group) {
      docs[group].push(match[2].trim());
    }
  }
  for (const match of raw.matchAll(/^\s*-\s+path:\s*["']?([^"'\r\n]+)["']?\s*$/gm)) {
    docs.supportingDocuments.push(match[1].trim());
  }
  return docs;
}

function summarizeDocset(docset) {
  return {
    manifest: docset.manifest,
    manifestHash: docset.raw ? shortHash(docset.raw) : "",
    temporaryArcs: docset.temporaryArcs,
    legacy: docset.legacy,
    statusDocuments: docset.statusDocuments,
    architectureDocuments: docset.architectureDocuments,
    maintainerDocuments: docset.maintainerDocuments,
  };
}

function migrateManifestText(raw) {
  return raw
    .replace(/^arcs:\s*["']?0\.2["']?\s*$/m, "yaiml: 0.2")
    .replace(/^arcs:/m, "yaiml:")
    .replace(/\bARCS\b/g, "YAIML")
    .replace(/\barcs-project-memory\b/g, "yaiml-project-memory");
}

async function appendRunNote(filePath, note) {
  const exists = await pathExists(filePath);
  if (!exists) {
    throw new Error(`Cannot update missing YAIML state document: ${filePath}`);
  }
  const raw = await fs.readFile(filePath, "utf8");
  const stamp = new Date().toISOString();
  const block = [
    "",
    "## StewAIrd Run Notes",
    "",
    `- ${stamp}: StewAIrd executed ${note.command} for ${note.projectName}. Validation outcome is recorded in StewAIrd's run record, not copied here as raw command output.`,
    "",
  ].join("\n");
  await fs.writeFile(filePath, raw.replace(/\s*$/, "\n") + block, "utf8");
}

async function writeRunRecord(run, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `${run.id}.json`);
  const mdPath = path.join(outputDir, `${run.id}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");
  await fs.writeFile(mdPath, buildPortfolioReport(run), "utf8");
  return { jsonPath, markdownPath: mdPath };
}

async function readLatestRunRecord(outputDir) {
  try {
    const entries = await fs.readdir(outputDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
    for (const name of candidates) {
      try {
        const raw = await fs.readFile(path.join(outputDir, name), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.repositories)) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function compareRepositorySnapshot(current, previous) {
  if (!previous) {
    return {
      previousRunId: "",
      changed: false,
      changes: ["no previous run record for this repository"],
    };
  }

  const changes = [];
  const currentGit = current.gitAfter ?? current.gitBefore ?? {};
  const previousGit = previous.gitAfter ?? previous.gitBefore ?? {};
  if ((currentGit.branch ?? "") !== (previousGit.branch ?? "")) {
    changes.push(`branch ${previousGit.branch || "unknown"} -> ${currentGit.branch || "unknown"}`);
  }
  if ((currentGit.head ?? "") !== (previousGit.head ?? "")) {
    changes.push(`HEAD ${previousGit.head || "unknown"} -> ${currentGit.head || "unknown"}`);
  }
  const currentDirtyCount = Array.isArray(currentGit.status) ? currentGit.status.length : 0;
  const previousDirtyCount = Array.isArray(previousGit.status) ? previousGit.status.length : 0;
  if (currentDirtyCount !== previousDirtyCount || Boolean(currentGit.dirty) !== Boolean(previousGit.dirty)) {
    changes.push(`dirty files ${previousDirtyCount} -> ${currentDirtyCount}`);
  }
  if ((current.yaiml?.manifest ?? "") !== (previous.yaiml?.manifest ?? "")) {
    changes.push(`YAIML manifest ${previous.yaiml?.manifest || "none"} -> ${current.yaiml?.manifest || "none"}`);
  }
  if ((current.yaiml?.manifestHash ?? "") && (previous.yaiml?.manifestHash ?? "") && current.yaiml.manifestHash !== previous.yaiml.manifestHash) {
    changes.push(`YAIML manifest hash ${previous.yaiml.manifestHash} -> ${current.yaiml.manifestHash}`);
  }

  const currentValidation = summarizeValidationOutcome(current.validation);
  const previousValidation = summarizeValidationOutcome(previous.validation);
  if (currentValidation !== "not run" && currentValidation !== previousValidation) {
    changes.push(`validation ${previousValidation} -> ${currentValidation}`);
  }

  return {
    previousRunId: previous.runId ?? "",
    previousStatus: previous.status ?? "",
    changed: changes.length > 0,
    changes: changes.length ? changes : ["unchanged"],
  };
}

function summarizeValidationOutcome(validation = []) {
  if (!validation.length) {
    return "not run";
  }
  const failed = validation.filter((item) => item.status === "failed").length;
  const blocked = validation.filter((item) => item.status === "blocked").length;
  const passed = validation.filter((item) => item.status === "passed").length;
  return `${passed} passed, ${failed} failed, ${blocked} blocked`;
}

function shouldResumeSkip(command, previousRun, previousRepo) {
  if (!previousRun || !previousRepo) {
    return false;
  }
  if (!["completed", "dispatched"].includes(previousRepo.status)) {
    return false;
  }
  const previousAction = previousRepo.action ?? previousRun.action ?? "";
  if (previousAction && previousAction !== command.action) {
    return false;
  }
  const previousLens = previousRun.campaignLens ?? previousRepo.campaignLens ?? "";
  if (previousLens && previousLens !== (command.campaignLens ?? "")) {
    return false;
  }
  return true;
}

function formatSnapshotComparison(comparison) {
  return comparison.changes.join("; ");
}

function summarizeRun(run) {
  const count = (status) => run.repositories.filter((repo) => repo.status === status).length;
  return {
    completed: count("completed"),
    dispatched: count("dispatched"),
    inspected: count("inspected"),
    planned: count("planned"),
    blocked: count("blocked"),
    failed: count("failed"),
    skipped: count("skipped"),
  };
}

async function gitStatus(root) {
  if (!(await pathExists(path.join(root, ".git")))) {
    return { isRepo: false, dirty: false, status: [] };
  }
  try {
    const [{ stdout }, branch, head] = await Promise.all([
      execFileAsync("git", ["-C", root, "status", "--short"], { timeout: 8000, windowsHide: true }),
      gitValue(root, ["branch", "--show-current"]),
      gitValue(root, ["rev-parse", "--short", "HEAD"]),
    ]);
    const status = stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    return { isRepo: true, dirty: status.length > 0, status, branch, head };
  } catch (error) {
    return { isRepo: true, dirty: true, status: [`git status failed: ${error.message}`] };
  }
}

async function gitValue(root, args) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args], { timeout: 8000, windowsHide: true });
    return stdout.trim();
  } catch {
    return "";
  }
}

function normalizeValidationEntry(entry) {
  if (typeof entry === "string") {
    return { command: entry, cwd: ".", kind: "command" };
  }
  if (entry && typeof entry === "object") {
    return {
      command: String(entry.command ?? ""),
      cwd: String(entry.cwd ?? "."),
      kind: String(entry.kind ?? "command"),
      label: entry.label ? String(entry.label) : undefined,
    };
  }
  return { command: "", cwd: ".", kind: "command" };
}

function formatValidationLabel(validation) {
  const label = validation.label ?? validation.command;
  return validation.cwd && validation.cwd !== "." ? `${label} (cwd: ${validation.cwd})` : label;
}

function formatGitSnapshot(git) {
  if (!git.isRepo) {
    return "not a git repo";
  }
  const branch = git.branch || "detached";
  const head = git.head ? ` @ ${git.head}` : "";
  return `${branch}${head}, ${git.dirty ? "dirty" : "clean"}`;
}

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function parseShellWords(command) {
  const words = [];
  for (const match of command.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)) {
    words.push(match[1] ?? match[2] ?? match[3]);
  }
  return words;
}

function isForbiddenCommand(parsed) {
  const first = parsed[0]?.toLowerCase();
  const second = parsed[1]?.toLowerCase();
  if (first === "git" && ["commit", "push", "reset", "clean", "checkout"].includes(second)) {
    return true;
  }
  return ["deploy", "publish", "release"].includes(first);
}

function sanitizeOutput(value) {
  return String(value ?? "").split(/\r?\n/).slice(0, 60).join("\n");
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function makeRunId(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function normalizePath(value) {
  return path.resolve(value).toLowerCase();
}

function slug(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "project";
}
