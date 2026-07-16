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
  const root = await mkdtemp(path.join(os.tmpdir(), "stewaird-registry-"));
  await mkdir(path.join(root, "registry"), { recursive: true });
  await mkdir(path.join(root, "standard"), { recursive: true });
  await mkdir(path.join(root, "consumer"), { recursive: true });
  await writeFile(path.join(root, "standard", "SOT.md"), "# Standard State\n");
  await writeFile(path.join(root, "consumer", "STATUS.md"), "# Consumer Status\n");

  const registryPath = path.join(root, "registry", "projects.json");
  await writeFile(registryPath, JSON.stringify({
    schema: "stewaird.registry.v0",
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
  assert.match(status, /Codex task: unmapped/);
  assert.match(status, /Codex task: local\/thread-consumer \(Consumer task\)/);

  const capabilityMap = buildCapabilityMap(inspected);
  assert.match(capabilityMap, /Producers: standard/);
  assert.match(capabilityMap, /Consumers: consumer/);

  const codexTaskMap = buildCodexTaskMap(inspected);
  assert.match(codexTaskMap, /Mapped tasks: 1/);
  assert.match(codexTaskMap, /Unmapped projects: 1/);
  assert.match(codexTaskMap, /Consumer task/);
  assert.match(codexTaskMap, /CWD check: matches registry path/);
  assert.match(codexTaskMap, /Standard \(standard\)/);
});
