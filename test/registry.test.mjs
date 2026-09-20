import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCapabilityMap,
  buildCodexTaskMap,
  buildStatusReport,
  inspectRegistry,
  loadRegistry,
  orderProjects,
} from "../src/registry.mjs";

test("orders projects by declared dependency order", async () => {
  const registry = {
    dependencyOrder: ["standard", "consumer"],
    projects: [
      { id: "consumer", dependencyTier: 10 },
      { id: "standard", dependencyTier: 0 },
    ],
  };

  assert.deepEqual(orderProjects(registry).map((project) => project.id), ["standard", "consumer"]);
});

test("inspects registry documents and reports capabilities", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-registry-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "standard"), { recursive: true });
  await mkdir(path.join(root, "consumer"), { recursive: true });
  await writeFile(path.join(root, "standard", "SOT.md"), "# Standard State\n");
  await writeFile(path.join(root, "consumer", "STATUS.md"), "# Consumer Status\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "shepaird.registry.v0",
    dependencyOrder: ["standard", "consumer"],
    projects: [
      {
        id: "standard",
        name: "Standard",
        kind: "standard",
        path: "standard",
        dependencyTier: 0,
        statusDocuments: ["SOT.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: [],
        capabilities: { produces: ["provider-adapter-contract"], consumes: [] },
        interfaceEvidence: [{
          capability: "provider-adapter-contract",
          role: "producer",
          paths: ["SOT.md"],
          summary: "Fixture producer evidence.",
        }],
      },
      {
        id: "consumer",
        name: "Consumer",
        kind: "app",
        path: "consumer",
        dependencyTier: 1,
        statusDocuments: ["STATUS.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: ["standard"],
        capabilities: { produces: [], consumes: ["provider-adapter-contract"] },
        codexProject: {
          projectId: path.join(root, "consumer"),
          hostId: "local",
          label: "Consumer",
          path: path.join(root, "consumer"),
          kind: "local",
        },
        codexThread: {
          threadId: "thread-consumer",
          hostId: "local",
          title: "Consumer task",
          cwd: path.join(root, "consumer"),
        },
      },
    ],
  }, null, 2));

  const inspected = await inspectRegistry(registryPath);
  assert.equal(inspected.projects[0].documents.statusDocuments[0].heading, "Standard State");
  assert.equal(inspected.projects[1].documents.statusDocuments[0].heading, "Consumer Status");

  const status = buildStatusReport(inspected);
  assert.match(status, /Standard/);
  assert.match(status, /Consumer/);
  assert.match(status, /provider-adapter-contract/);
  assert.match(status, /Interface evidence:/);
  assert.match(status, /Readiness:/);
  assert.match(status, /Codex Project: unmapped/);
  assert.match(status, /Codex Project: local\//);
  assert.match(status, /Codex task: unmapped/);
  assert.match(status, /Codex task: local\/thread-consumer \(Consumer task\)/);
  assert.match(status, /Codex route: ready/);

  const capabilityMap = buildCapabilityMap(inspected);
  assert.match(capabilityMap, /Producers: standard/);
  assert.match(capabilityMap, /Consumers: consumer/);

  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /ShepAIrd Codex Route Map/);
  assert.match(codexTaskMap, /Codex Projects mapped: 1/);
  assert.match(codexTaskMap, /Codex Projects missing: 1/);
  assert.match(codexTaskMap, /Mapped tasks: 1/);
  assert.match(codexTaskMap, /Unmapped projects: 1/);
  assert.match(codexTaskMap, /Ready routes: 1/);
  assert.match(codexTaskMap, /Needs Codex Project: 1/);
  assert.match(codexTaskMap, /Touchpoint tasks missing total: 1/);
  assert.match(codexTaskMap, /Consumer task/);
  assert.match(codexTaskMap, /Codex Project path matches registry path/);
  assert.match(codexTaskMap, /Route check: cwd matches registry path/);
  assert.match(codexTaskMap, /Setup Needed/);
  assert.match(codexTaskMap, /create or open a saved repo-root Codex Project/);
  assert.match(codexTaskMap, /Standard \(standard\)/);
});

test("codex task map supports parent-workspace tasks scoped to a repository path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-thread-scope-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "parent", "scoped"), { recursive: true });
  await writeFile(path.join(root, "parent", "scoped", "SOT.md"), "# Scoped State\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "shepaird.registry.v0",
    projects: [
      {
        id: "scoped",
        name: "Scoped",
        kind: "app",
        path: "parent/scoped",
        statusDocuments: ["SOT.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: [],
        capabilities: { produces: [], consumes: [] },
        validation: ["git status review"],
        codexProject: {
          projectId: path.join(root, "parent", "scoped"),
          hostId: "local",
          label: "Scoped",
          path: path.join(root, "parent", "scoped"),
          kind: "local",
        },
        codexThread: {
          threadId: "thread-parent",
          hostId: "local",
          title: "Scoped parent task",
          cwd: path.join(root, "parent"),
          scopePath: path.join(root, "parent", "scoped"),
        },
      },
    ],
  }, null, 2));

  const inspected = await inspectRegistry(registryPath);
  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /Codex Projects mapped: 1/);
  assert.match(codexTaskMap, /Mapped tasks: 1/);
  assert.match(codexTaskMap, /Task scope:/);
  assert.match(codexTaskMap, /Project route check: Codex Project path matches registry path/);
  assert.match(codexTaskMap, /Route check: scope path matches registry path inside task cwd/);
  assert.match(codexTaskMap, /CWD mismatches: 0/);
});

test("codex task map flags scoped tasks outside their task cwd", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-thread-mismatch-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "parent", "scoped"), { recursive: true });
  await writeFile(path.join(root, "parent", "scoped", "SOT.md"), "# Scoped State\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "shepaird.registry.v0",
    projects: [
      {
        id: "scoped",
        name: "Scoped",
        kind: "app",
        path: "parent/scoped",
        statusDocuments: ["SOT.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: [],
        capabilities: { produces: [], consumes: [] },
        validation: ["git status review"],
        codexProject: {
          projectId: path.join(root, "parent", "scoped"),
          hostId: "local",
          label: "Scoped",
          path: path.join(root, "parent", "scoped"),
          kind: "local",
        },
        codexThread: {
          threadId: "thread-parent",
          hostId: "local",
          title: "Scoped parent task",
          cwd: path.join(root, "other-parent"),
          scopePath: path.join(root, "parent", "scoped"),
        },
      },
    ],
  }, null, 2));

  const inspected = await inspectRegistry(registryPath);
  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /CWD mismatches: 1/);
  assert.match(codexTaskMap, /outside task cwd/);
});

test("codex route map separates saved projects from touchpoint tasks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-project-route-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "project-only"), { recursive: true });
  await writeFile(path.join(root, "project-only", "SOT.md"), "# Project Only\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "shepaird.registry.v0",
    projects: [
      {
        id: "project-only",
        name: "Project Only",
        kind: "app",
        path: "project-only",
        statusDocuments: ["SOT.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: [],
        capabilities: { produces: [], consumes: [] },
        validation: ["git status review"],
        codexProject: {
          projectId: path.join(root, "project-only"),
          hostId: "local",
          label: "Project Only",
          path: path.join(root, "project-only"),
          kind: "local",
        },
      },
    ],
  }, null, 2));

  const inspected = await inspectRegistry(registryPath);
  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /Codex Projects mapped: 1/);
  assert.match(codexTaskMap, /Mapped tasks: 0/);
  assert.match(codexTaskMap, /Has Project but needs touchpoint task: 1/);
  assert.match(codexTaskMap, /Touchpoint tasks missing total: 1/);
  assert.match(codexTaskMap, /Route health: needs touchpoint task/);
  assert.match(codexTaskMap, /create one durable touchpoint task/);
});

test("local route overlay supplies private Codex routing without public registry fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-local-routes-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app", "SOT.md"), "# App State\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "shepaird.registry.v0",
    projects: [
      {
        id: "app",
        name: "App",
        kind: "app",
        path: "app",
        statusDocuments: ["SOT.md"],
        architectureDocuments: [],
        maintainerDocuments: [],
        agentInstructions: [],
        yaimlDocuments: [],
        dependsOn: [],
        capabilities: { produces: [], consumes: [] },
        validation: ["git status review"],
      },
    ],
  }, null, 2));
  await writeFile(path.join(root, "registry", "local-routes.json"), JSON.stringify({
    schema: "shepaird.local-routes.v0",
    projects: {
      app: {
        codexProject: {
          projectId: path.join(root, "app"),
          hostId: "local",
          label: "App",
          path: path.join(root, "app"),
          kind: "local",
        },
        codexThread: {
          threadId: "thread-app",
          hostId: "local",
          title: "App task",
          cwd: path.join(root, "app"),
        },
      },
    },
  }, null, 2));

  const registry = await loadRegistry(registryPath);
  assert.equal(registry.projects[0].codexProject.projectId, path.join(root, "app"));
  assert.equal(registry.projects[0].codexThread.threadId, "thread-app");
  assert.equal(registry.localRoutesLoaded, true);

  const inspected = await inspectRegistry(registryPath);
  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /Codex Projects mapped: 1/);
  assert.match(codexTaskMap, /Mapped tasks: 1/);
  assert.match(codexTaskMap, /Ready routes: 1/);
  assert.match(codexTaskMap, /App task/);
});
