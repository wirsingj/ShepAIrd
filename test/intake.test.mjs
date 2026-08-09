import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { scanFolders } from "../src/intake.mjs";

const execFileAsync = promisify(execFile);

test("detects YAIML-aware repo, docs, capabilities, and aggregate counts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-intake-"));
  const repo = path.join(root, "tool");
  const plain = path.join(root, "plain");
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await mkdir(plain, { recursive: true });
  await writeFile(path.join(repo, "yaiml.yml"), [
    "yaiml: 0.2",
    "project:",
    "  id: token-tool",
    "  name: Token Tool",
    "documents:",
    "  sot:",
    "    path: STATE_OF_THE_UNION.md",
    "  maintainer:",
    "    path: docs/MAINTAINING.md",
    "",
  ].join("\n"));
  await writeFile(path.join(repo, "STATE_OF_THE_UNION.md"), "---\nyaiml: 0.1\n---\n# Token Tool State\nProvider adapter with structured JSON review.\n");
  await writeFile(path.join(repo, "docs", "MAINTAINING.md"), "# Maintainer Guide\n");
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "token-tool" }));

  const scan = await scanFolders([repo, plain]);
  assert.equal(scan.selectedCount, 2);
  assert.equal(scan.aggregate.yaimlAwareCount, 1);
  assert.equal(scan.aggregate.missingStateDocCount, 1);

  const token = scan.projects.find((project) => project.name === "Token Tool");
  assert.ok(token);
  assert.equal(token.isYaimlAware, true);
  assert.equal(token.statusDocs.some((doc) => doc.path === "STATE_OF_THE_UNION.md" && doc.exists), true);
  assert.equal(token.maintainerDocs.some((doc) => doc.path === "docs/MAINTAINING.md" && doc.exists), true);
  assert.deepEqual(token.capabilityHints, ["human-approval", "provider-adapter", "structured-output", "yaiml-project-memory"]);

  const plainToken = scan.projects.find((project) => project.name === "plain");
  assert.ok(plainToken.warnings.some((warning) => /No YAIML/.test(warning)));
});

test("detects current nested YAIML core documents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-intake-nested-"));
  const repo = path.join(root, "nested");
  await mkdir(path.join(repo, "docs"), { recursive: true });
  await writeFile(path.join(repo, "yaiml.yml"), [
    "yaiml:",
    "  version: \"0.2.0\"",
    "  core:",
    "    state: docs/SoTY.md",
    "    architecture: docs/ARCHITECTURE.md",
    "    maintainer_guide: docs/MAINTAINER_GUIDE.md",
    "",
  ].join("\n"));
  await writeFile(path.join(repo, "docs", "SoTY.md"), "# Nested State\n");
  await writeFile(path.join(repo, "docs", "ARCHITECTURE.md"), "# Nested Architecture\n");
  await writeFile(path.join(repo, "docs", "MAINTAINER_GUIDE.md"), "# Nested Maintainer Guide\n");
  await writeFile(path.join(repo, "package.json"), JSON.stringify({ name: "nested-tool" }));

  const scan = await scanFolders([repo]);
  const nested = scan.projects[0];

  assert.equal(nested.isYaimlAware, true);
  assert.equal(nested.statusDocs.some((doc) => doc.path === "docs/SoTY.md" && doc.exists), true);
  assert.equal(nested.architectureDocs.some((doc) => doc.path === "docs/ARCHITECTURE.md" && doc.exists), true);
  assert.equal(nested.maintainerDocs.some((doc) => doc.path === "docs/MAINTAINER_GUIDE.md" && doc.exists), true);
  assert.equal(nested.warnings.some((warning) => /No state/.test(warning)), false);
});

test("detects git dirty state without modifying repo files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-dirty-"));
  await writeFile(path.join(root, "yaiml.yml"), "yaiml: 0.2\nproject: Dirty Repo\n");
  await writeFile(path.join(root, "SOT.md"), "# Dirty State\n");

  try {
    await execFileAsync("git", ["init"], { cwd: root, timeout: 8000 });
  } catch {
    t.skip("git is unavailable");
    return;
  }

  await writeFile(path.join(root, "untracked.txt"), "dirty\n");
  const scan = await scanFolders([root]);
  assert.equal(scan.projects[0].isGitRepo, true);
  assert.equal(scan.projects[0].gitDirty, true);
  assert.match(scan.projects[0].dirtySample.join("\n"), /untracked\.txt/);
  assert.equal(scan.aggregate.dirtyCount, 1);
});
