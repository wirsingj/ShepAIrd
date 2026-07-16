import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  discoverWorkspaceRepos,
  interpretPortfolioCommand,
  reconcileWorkspace,
  runPortfolioCommand,
} from "../src/portfolio.mjs";
import { loadRegistry } from "../src/registry.mjs";

const execFileAsync = promisify(execFile);

test("discovers workspace git repositories and reconciles managed, discovered, moved, excluded, and missing states", async (t) => {
  const fixture = await makeFixture(t);
  await makeRepo(path.join(fixture.root, "managed-a"));
  await makeRepo(path.join(fixture.root, "new-tool"));
  await makeRepo(path.join(fixture.root, "excluded-tool"));
  await makeRepo(path.join(fixture.root, "renamed-standard"));

  await writeRegistry(fixture, [
    project("self", "Self", ".", { managed: true }),
    project("yaiml", "YAIML", "missing-yaiml", { managed: true }),
    project("managed-a", "Managed A", "managed-a", { managed: true }),
    project("renamed", "renamed-standard", "old-standard", { managed: true }),
    project("excluded", "Excluded", "excluded-tool", { managed: false }),
  ], ["self", "yaiml", "managed-a", "renamed", "excluded"]);

  const registry = await loadRegistry(fixture.registryPath);
  const discoveries = await discoverWorkspaceRepos(fixture.root);
  const reconciliation = reconcileWorkspace(registry, discoveries);

  assert.ok(reconciliation.managed.some((item) => item.id === "self" && item.state === "managed"));
  assert.ok(reconciliation.managed.some((item) => item.id === "managed-a" && item.state === "managed"));
  assert.ok(reconciliation.managed.some((item) => item.id === "excluded" && item.state === "excluded"));
  assert.ok(reconciliation.missing.some((item) => item.id === "yaiml"));
  assert.ok(reconciliation.moved.some((item) => item.id === "renamed"));
  assert.ok(reconciliation.discovered.some((item) => item.id === "new-tool"));
});

test("interprets inspect, plan, apply, default one-step, and explicit N-step commands", () => {
  assert.equal(interpretPortfolioCommand("Audit all projects").mode, "inspect");
  assert.equal(interpretPortfolioCommand("Plan the next step for every project").mode, "plan");
  const securityPlan = interpretPortfolioCommand("Plan a security audit across every app");
  assert.equal(securityPlan.mode, "plan");
  assert.equal(securityPlan.campaignLens, "security");
  assert.equal(interpretPortfolioCommand("Do a bug check across every app").mode, "plan");
  assert.equal(interpretPortfolioCommand("Do a bug check across every app").campaignLens, "bug-check");
  assert.equal(interpretPortfolioCommand("Run a code-pattern audit across every app").campaignLens, "bug-check");
  assert.equal(interpretPortfolioCommand("Run a code-pattern audit across every app and update YAIML").campaignLens, "bug-check");
  assert.equal(interpretPortfolioCommand("Review docs drift across every app").campaignLens, "docs-drift");
  const securityApply = interpretPortfolioCommand("Run a security audit and fix issues across every app");
  assert.equal(securityApply.mode, "apply");
  assert.equal(securityApply.action, "campaign-handoff");
  assert.equal(securityApply.campaignLens, "security");
  const docsApply = interpretPortfolioCommand("Run docs drift audit and fix issues across every app");
  assert.equal(docsApply.mode, "apply");
  assert.equal(docsApply.action, "campaign-handoff");
  assert.equal(docsApply.campaignLens, "docs-drift");
  assert.equal(interpretPortfolioCommand("Run audit", { lens: "security" }).action, "campaign-handoff");
  const apply = interpretPortfolioCommand("Continue LoreKeeper and SpriteWrite for two bounded steps each");
  assert.equal(apply.mode, "apply");
  assert.equal(apply.action, "continue-yaiml-checklist");
  assert.equal(apply.stepLimit, 2);
  assert.deepEqual(apply.targetIds, ["lorekeeper", "spritewrite"]);
  assert.equal(interpretPortfolioCommand("continue through the YAIML checklist").stepLimit, 1);
  assert.equal(interpretPortfolioCommand("Check all YAIML states and continue working through issues").mode, "apply");
});

test("apply mode invokes the direct executor, runs validation, updates YAIML state, and records a run", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "managed-a");
  await makeRepo(repo);
  await mkdir(path.join(repo, "checks"));
  await writeYaiml(repo, "SOT.md");
  await writeRegistry(fixture, [
    project("managed-a", "Managed A", "managed-a", {
      validation: [
        { command: `node -e "require('fs').writeFileSync('../validated.txt','ok')"`, cwd: "checks" },
        "git push",
      ],
    }),
  ], ["managed-a"]);

  const run = await runPortfolioCommand("Continue one YAIML-defined step in every active managed repository", {
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.mode, "apply");
  assert.equal(run.repositories.length, 1);
  assert.equal(run.repositories[0].status, "failed");
  assert.ok(run.repositories[0].filesChanged.includes("SOT.md"));
  assert.ok(run.repositories[0].validation.some((item) => item.command.startsWith("node -e") && item.status === "passed"));
  assert.ok(run.repositories[0].validation.some((item) => item.cwd === "checks"));
  assert.ok(run.repositories[0].validation.some((item) => item.command === "git push" && item.status === "blocked"));
  assert.match(await readFile(path.join(repo, "validated.txt"), "utf8"), /ok/);
  assert.match(await readFile(path.join(repo, "SOT.md"), "utf8"), /StewAIrd Run Notes/);
  assert.match(await readFile(path.join(fixture.root, "runs", `${run.id}.json`), "utf8"), /direct-filesystem-command-executor/);
});

test("plan mode does not mutate repositories or claim completion", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "managed-a");
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await writeRegistry(fixture, [project("managed-a", "Managed A", "managed-a")], ["managed-a"]);
  const before = await readFile(path.join(repo, "SOT.md"), "utf8");

  const run = await runPortfolioCommand("Show what continuing all projects would do", {
    mode: "plan",
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.repositories[0].status, "planned");
  assert.equal(await readFile(path.join(repo, "SOT.md"), "utf8"), before);
});

test("campaign plan mode builds ephemeral handoff context without stored packet files", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "web-app");
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await mkdir(path.join(repo, "scripts"), { recursive: true });
  await writeFile(path.join(repo, "package.json"), JSON.stringify({
    scripts: {
      test: "node test.js",
      build: "vite build",
      audit: "npm audit",
    },
  }, null, 2));
  await writeFile(path.join(repo, "manifest.json"), JSON.stringify({
    manifest_version: 3,
    permissions: ["storage"],
  }, null, 2));
  await writeFile(path.join(repo, "scripts", "audit.ps1"), "Write-Output 'audit'\n");
  await writeRegistry(fixture, [
    project("web-app", "Web App", "web-app", {
      kind: "browser-extension",
      validation: [{ command: "npm test", cwd: "app" }],
      capabilities: { produces: ["extension-runtime"], consumes: ["yaiml-project-memory"] },
      interfaceEvidence: [
        {
          capability: "extension-runtime",
          role: "producer",
          paths: ["manifest.json", "src/content-script.js"],
          summary: "Fixture extension surfaces.",
        },
      ],
    }),
  ], ["web-app"]);
  const before = await readFile(path.join(repo, "SOT.md"), "utf8");

  const run = await runPortfolioCommand("Plan a security audit campaign across all managed repositories and fix low-risk issues", {
    mode: "plan",
    registryPath: fixture.registryPath,
    outputRoot: path.join(fixture.root, "output"),
  });

  assert.equal(run.mode, "plan");
  assert.equal(run.action, "portfolio-plan");
  assert.equal(run.campaignLens, "security");
  assert.equal(run.repositories[0].status, "planned");
  assert.match(run.repositories[0].campaignHandoff.objective, /security/i);
  assert.match(run.repositories[0].campaignHandoff.command, /Run a security audit/i);
  assert.match(run.repositories[0].campaignHandoff.prompt, /Fix safe bounded issues: yes/);
  assert.ok(run.repositories[0].campaignHandoff.auditSurfaces.some((item) => item.includes("manifest.json")));
  assert.ok(run.repositories[0].campaignHandoff.auditSurfaces.some((item) => item.includes("Package manifest: package.json scripts:")));
  assert.ok(run.repositories[0].campaignHandoff.auditSurfaces.some((item) => item.includes("Detected file: manifest.json")));
  assert.ok(run.repositories[0].campaignHandoff.fileSignals.files.includes("package.json"));
  assert.ok(run.repositories[0].campaignHandoff.fileSignals.files.includes("manifest.json"));
  assert.ok(run.repositories[0].campaignHandoff.fileSignals.files.includes("scripts/audit.ps1"));
  assert.ok(run.repositories[0].campaignHandoff.validation.includes("npm test (cwd: app)"));
  assert.equal(await readFile(path.join(repo, "SOT.md"), "utf8"), before);
  assert.equal(Object.hasOwn(run, "campaignPacketPaths"), false);
  await assert.rejects(readFile(path.join(fixture.root, "output", "work-packets", "security", "web-app-security-campaign.md"), "utf8"));
});

test("docs-drift campaign handoff includes shallow content signals", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "docs-app");
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await writeFile(path.join(repo, "README.md"), "# Docs App\n\nLegacy ARCS packet language.\n");
  await writeRegistry(fixture, [project("docs-app", "Docs App", "docs-app")], ["docs-app"]);

  const run = await runPortfolioCommand("Review docs drift across every app", {
    registryPath: fixture.registryPath,
    outputRoot: path.join(fixture.root, "output"),
  });

  const signals = run.repositories[0].campaignHandoff.contentSignals;
  assert.ok(signals.some((item) => item.includes("README present")));
  assert.ok(signals.some((item) => item.includes("Potential stale terminology in README.md")));
  assert.ok(signals.some((item) => item.includes("Declared YAIML document missing: ARCHITECTURE.md")));
  assert.match(run.repositories[0].campaignHandoff.prompt, /Shallow content signals:/);
  assert.ok(run.repositories[0].campaignHandoff.auditSurfaces.some((item) => item.includes("Shallow content signal:")));
});

test("campaign apply is blocked until a Codex handoff dispatcher exists", async (t) => {
  const fixture = await makeFixture(t);
  const repoA = path.join(fixture.root, "managed-a");
  const repoB = path.join(fixture.root, "managed-b");
  await makeRepo(repoA);
  await makeRepo(repoB);
  await writeYaiml(repoA, "SOT.md");
  await writeYaiml(repoB, "SOT.md");
  await writeRegistry(fixture, [
    project("managed-a", "Managed A", "managed-a"),
    project("managed-b", "Managed B", "managed-b", { dependsOn: ["managed-a"] }),
  ], ["managed-a", "managed-b"]);

  const run = await runPortfolioCommand("Apply a performance pass across all managed repositories", {
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.mode, "apply");
  assert.equal(run.campaignLens, "performance");
  assert.deepEqual(run.repositories.map((repo) => repo.status), ["blocked", "blocked"]);
  assert.match(run.repositories[0].blockers[0], /no handoff dispatcher is configured/);
  assert.match(run.repositories[1].blockers[0], /no handoff dispatcher is configured/);
  assert.match(run.repositories[0].campaignHandoff.prompt, /Run a performance pass/);
});

test("campaign apply dispatches thin Codex handoff when a dispatcher is configured", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "managed-a");
  const dispatches = [];
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await writeRegistry(fixture, [
    project("managed-a", "Managed A", "managed-a", {
      validation: ["npm test"],
      codexThread: { threadId: "thread-managed-a", hostId: "local", title: "Managed A task" },
      interfaceEvidence: [
        {
          capability: "web-runtime",
          role: "producer",
          paths: ["package.json"],
          summary: "Fixture package surface.",
        },
      ],
    }),
  ], ["managed-a"]);
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ scripts: { test: "node test.js" } }, null, 2));

  const run = await runPortfolioCommand("Run a security audit and fix issues across all managed repositories", {
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
    handoffDispatcher: async (payload) => {
      dispatches.push(payload);
      return { status: "sent", target: `thread:${payload.project.id}` };
    },
  });

  assert.equal(run.action, "campaign-handoff");
  assert.equal(run.summary.dispatched, 1);
  assert.equal(run.repositories[0].status, "dispatched");
  assert.equal(run.repositories[0].handoff.target, "thread:managed-a");
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].handoff.codexThread.threadId, "thread-managed-a");
  assert.match(dispatches[0].handoff.prompt, /Fix safe bounded issues: yes/);
  assert.match(dispatches[0].handoff.prompt, /Read first:/);
  assert.match(dispatches[0].handoff.prompt, /Validation:\n- npm test/);
  assert.match(await readFile(run.recordPaths.markdownPath, "utf8"), /Dispatched: 1/);
});

test("validate mode runs registered checks without mutating YAIML state", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "managed-a");
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await writeRegistry(fixture, [
    project("managed-a", "Managed A", "managed-a", {
      validation: [`node -e "process.exit(0)"`],
    }),
  ], ["managed-a"]);
  const before = await readFile(path.join(repo, "SOT.md"), "utf8");

  const run = await runPortfolioCommand("Validate all managed projects", {
    mode: "validate",
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.mode, "validate");
  assert.equal(run.action, "portfolio-validation");
  assert.equal(run.repositories[0].status, "completed");
  assert.ok(run.repositories[0].validation.some((item) => item.status === "passed"));
  assert.equal(await readFile(path.join(repo, "SOT.md"), "utf8"), before);
});

test("portfolio runs compare each repository with the previous run record", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "managed-a");
  const runDir = path.join(fixture.root, "runs");
  await makeRepo(repo);
  await writeYaiml(repo, "SOT.md");
  await mkdir(runDir, { recursive: true });
  await writeRegistry(fixture, [
    project("managed-a", "Managed A", "managed-a", {
      validation: [`node -e "process.exit(0)"`],
    }),
  ], ["managed-a"]);
  await writeFile(path.join(runDir, "2026-01-01T00-00-00-000Z.json"), JSON.stringify({
    id: "2026-01-01T00-00-00-000Z",
    repositories: [
      {
        id: "managed-a",
        status: "completed",
        gitBefore: { isRepo: true, dirty: false, status: [], branch: "main", head: "old123" },
        yaiml: { manifest: "yaiml.yml", manifestHash: "oldhash" },
        validation: [{ command: "npm test", status: "passed" }],
      },
    ],
  }, null, 2));

  const run = await runPortfolioCommand("Validate all managed projects", {
    mode: "validate",
    registryPath: fixture.registryPath,
    outputDir: runDir,
  });

  const comparison = run.repositories[0].sincePreviousRun;
  assert.equal(run.previousRun.id, "2026-01-01T00-00-00-000Z");
  assert.equal(comparison.changed, true);
  assert.ok(comparison.changes.some((item) => item.includes("dirty files")));
  assert.ok(comparison.changes.some((item) => item.includes("YAIML manifest hash")));
  const report = await readFile(run.recordPaths.markdownPath, "utf8");
  assert.match(report, /Since previous run:/);
});

test("resume skips repositories already completed in the previous matching run", async (t) => {
  const fixture = await makeFixture(t);
  const runDir = path.join(fixture.root, "runs");
  await makeRepo(path.join(fixture.root, "done"));
  await writeYaiml(path.join(fixture.root, "done"), "SOT.md");
  await makeRepo(path.join(fixture.root, "todo"));
  await writeYaiml(path.join(fixture.root, "todo"), "SOT.md");
  await mkdir(runDir, { recursive: true });
  await writeRegistry(fixture, [
    project("done", "Done", "done", { validation: ["git status review"] }),
    project("todo", "Todo", "todo", { validation: ["git status review"] }),
  ], ["done", "todo"]);
  await writeFile(path.join(runDir, "2026-01-01T00-00-00-000Z.json"), JSON.stringify({
    id: "2026-01-01T00-00-00-000Z",
    action: "continue-yaiml-checklist",
    campaignLens: "",
    repositories: [
      { id: "done", action: "continue-yaiml-checklist", status: "completed" },
      { id: "todo", action: "continue-yaiml-checklist", status: "blocked" },
    ],
  }, null, 2));

  const run = await runPortfolioCommand("Resume continuing one YAIML-defined step in every active managed repository", {
    mode: "apply",
    registryPath: fixture.registryPath,
    outputDir: runDir,
  });

  assert.equal(run.resume, true);
  assert.equal(run.repositories[0].status, "skipped");
  assert.match(run.repositories[0].notes[0], /Already completed/);
  assert.notEqual(run.repositories[1].status, "skipped");
});

test("temporary ARCS cleanup renames arcs.yml to yaiml.yml", async (t) => {
  const fixture = await makeFixture(t);
  const repo = path.join(fixture.root, "legacy");
  await makeRepo(repo);
  await writeFile(path.join(repo, "arcs.yml"), "arcs: 0.2\nproject: Legacy\n");
  await writeFile(path.join(repo, "SOT.md"), "# Legacy State\n");
  await writeRegistry(fixture, [project("legacy", "Legacy", "legacy", { validation: ["git status review"] })], ["legacy"]);

  const run = await runPortfolioCommand("Clean temporary ARCS-era manifests back to YAIML", {
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.repositories[0].status, "completed");
  assert.match(await readFile(path.join(repo, "yaiml.yml"), "utf8"), /^yaiml:/);
  await assert.rejects(readFile(path.join(repo, "arcs.yml"), "utf8"));
});

test("blocked dependencies are isolated and downstream dependents are skipped", async (t) => {
  const fixture = await makeFixture(t);
  await makeRepo(path.join(fixture.root, "upstream"));
  await writeYaiml(path.join(fixture.root, "upstream"), "SOT.md");
  await makeRepo(path.join(fixture.root, "downstream"));
  await writeYaiml(path.join(fixture.root, "downstream"), "SOT.md");
  await writeRegistry(fixture, [
    project("upstream", "Upstream", "upstream", { validation: [] }),
    project("downstream", "Downstream", "downstream", { dependsOn: ["upstream"], validation: ["git status review"] }),
  ], ["upstream", "downstream"]);

  const run = await runPortfolioCommand("Continue one YAIML-defined step in every active managed repository", {
    registryPath: fixture.registryPath,
    outputDir: path.join(fixture.root, "runs"),
  });

  assert.equal(run.repositories[0].status, "blocked");
  assert.equal(run.repositories[1].status, "skipped");
  assert.match(run.repositories[1].blockers[0], /dependency upstream blocked/);
});

async function makeFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "stewaird-portfolio-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  const registryPath = path.join(root, "registry", "projects.json");
  t.diagnostic(root);
  return { root, registryPath };
}

async function makeRepo(root) {
  await mkdir(root, { recursive: true });
  try {
    await execFileAsync("git", ["init"], { cwd: root, timeout: 8000 });
  } catch {
    await mkdir(path.join(root, ".git"), { recursive: true });
  }
}

async function writeYaiml(root, statePath) {
  await writeFile(path.join(root, "yaiml.yml"), [
    "yaiml: 0.2",
    "documents:",
    "  sot:",
    `    path: ${statePath}`,
    "  architecture:",
    "    path: ARCHITECTURE.md",
    "  maintainer:",
    "    path: MAINTAINER_GUIDE.md",
    "",
  ].join("\n"));
  await writeFile(path.join(root, statePath), "# Fixture State\n");
}

async function writeRegistry(fixture, projects, dependencyOrder) {
  await writeFile(fixture.registryPath, JSON.stringify({
    schema: "stewaird.registry.v0",
    workspaceRoot: ".",
    dependencyOrder,
    projects,
  }, null, 2));
}

function project(id, name, repoPath, overrides = {}) {
  return {
    id,
    name,
    kind: overrides.kind ?? "fixture",
    path: repoPath,
    managed: overrides.managed ?? true,
    lifecycle: overrides.lifecycle ?? "active",
    dependencyTier: overrides.dependencyTier ?? 1,
    statusDocuments: ["SOT.md"],
    architectureDocuments: [],
    maintainerDocuments: [],
    agentInstructions: [],
    arcsDocuments: [],
    yaimlDocuments: ["yaiml.yml"],
    dependsOn: overrides.dependsOn ?? [],
    capabilities: overrides.capabilities ?? { produces: [], consumes: [] },
    validation: overrides.validation ?? ["git status review"],
    interfaceEvidence: overrides.interfaceEvidence ?? [],
    codexThread: overrides.codexThread ?? undefined,
    notes: "Fixture project.",
  };
}
