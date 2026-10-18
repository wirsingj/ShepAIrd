import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanFolder } from "../src/intake.mjs";
import { processRepository, readYaimlDocset } from "../src/portfolio.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "shepaird-discovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeMap(root, manifest, shape = "current") {
  const directory = path.dirname(manifest);
  await mkdir(path.join(root, directory), { recursive: true });
  const supporting = directory === "." ? "AI_USAGE.md" : "../AI_USAGE.md";
  const text = shape === "current" ? [
    "yaiml:", '  version: "0.2.0"', "  core:",
    "    state: STATE.md", "    architecture: DESIGN.md", "    maintainer_guide: CARE.md",
    "  supporting:", `    ai_usage: ${supporting}`,
  ] : [
    'yaiml: "0.2"', "documents:",
    "  sot:", "    path: STATE.md", "  architecture:", "    path: DESIGN.md",
    "  maintainer:", "    path: CARE.md", "supporting:", `  - path: ${supporting}`,
  ];
  await writeFile(path.join(root, manifest), `${text.join("\n")}\n`);
  for (const file of ["STATE.md", "DESIGN.md", "CARE.md"]) {
    await writeFile(path.join(root, directory, file), `# Declared ${file}\nProvider adapter.\n`);
  }
  await writeFile(path.join(root, "AI_USAGE.md"), "# AI Usage\n");
}

for (const manifest of ["yaiml.yml", "yaiml.yaml", ".yaiml/yaiml.yml", ".yaiml/yaiml.yaml"]) {
  for (const shape of ["current", "legacy"]) {
    test(`${manifest} with ${shape} roles resolves memory from the map directory`, async (t) => {
      const root = await fixture(t);
      await writeMap(root, manifest, shape);
      const before = await readFile(path.join(root, manifest), "utf8");
      const prefix = manifest.startsWith(".yaiml/") ? ".yaiml/" : "";
      const docset = await readYaimlDocset(root);
      assert.equal(docset.manifest, manifest);
      assert.equal(docset.hasYaiml, true);
      assert.equal(docset.temporaryArcs, false);
      assert.deepEqual(docset.statusDocuments, [`${prefix}STATE.md`]);
      assert.deepEqual(docset.architectureDocuments, [`${prefix}DESIGN.md`]);
      assert.deepEqual(docset.maintainerDocuments, [`${prefix}CARE.md`]);
      assert.deepEqual(docset.supportingDocuments, ["AI_USAGE.md"]);

      const token = await scanFolder(root);
      assert.equal(token.isYaimlAware, true);
      assert.equal(token.isTemporaryArcsAware, false);
      for (const [group, file] of [["statusDocs", "STATE.md"], ["architectureDocs", "DESIGN.md"], ["maintainerDocs", "CARE.md"]]) {
        assert.ok(token[group].some((doc) => doc.path === `${prefix}${file}` && doc.exists && doc.heading === `Declared ${file}`));
      }
      assert.ok(token.yaimlDocs.some((doc) => doc.path === manifest && doc.exists));
      assert.ok(token.capabilityHints.includes("provider-adapter"));
      assert.equal(token.warnings.some((warning) => /No state|No maintainer|No YAIML/.test(warning)), false);
      assert.equal(await readFile(path.join(root, manifest), "utf8"), before);
    });
  }
}

test("existing root map wins over a nested map without mixing their roles", async (t) => {
  const root = await fixture(t);
  await writeMap(root, "yaiml.yml");
  await writeMap(root, ".yaiml/yaiml.yml");
  const docset = await readYaimlDocset(root);
  assert.equal(docset.manifest, "yaiml.yml");
  assert.deepEqual(docset.statusDocuments, ["STATE.md"]);
  const token = await scanFolder(root);
  assert.equal(token.statusDocs.some((doc) => doc.path === ".yaiml/STATE.md"), false);
});

for (const manifest of ["arcs.yml", "arcs.yaml"]) {
  test(`${manifest} remains a fallback and cleanup preserves its memory`, async (t) => {
    const root = await fixture(t);
    await writeMap(root, manifest, "legacy");
    await writeFile(path.join(root, manifest), (await readFile(path.join(root, manifest), "utf8")).replace("yaiml:", "arcs:"));
    const state = await readFile(path.join(root, "STATE.md"), "utf8");
    const docset = await readYaimlDocset(root);
    assert.equal(docset.manifest, manifest);
    assert.equal(docset.temporaryArcs, true);
    assert.deepEqual(docset.statusDocuments, ["STATE.md"]);
    assert.equal((await scanFolder(root)).isTemporaryArcsAware, true);
    const result = await processRepository({ id: "fixture", name: "Fixture", absolutePath: root }, { mode: "apply", action: "temporary-arcs-cleanup" });
    assert.equal(result.status, "completed");
    assert.equal((await readYaimlDocset(root)).manifest, "yaiml.yml");
    await assert.rejects(readFile(path.join(root, manifest)), { code: "ENOENT" });
    assert.equal(await readFile(path.join(root, "STATE.md"), "utf8"), state);
  });
}

test("nested YAIML wins over ARCS and blocks cleanup of competing maps", async (t) => {
  const root = await fixture(t);
  await writeMap(root, ".yaiml/yaiml.yml");
  const arcs = 'arcs: "0.2"\ndocuments:\n  sot:\n    path: OLD.md\n';
  await writeFile(path.join(root, "arcs.yml"), arcs);
  const docset = await readYaimlDocset(root);
  assert.equal(docset.manifest, ".yaiml/yaiml.yml");
  assert.equal(docset.hasTemporaryArcs, true);
  assert.equal(docset.temporaryArcs, false);
  const token = await scanFolder(root);
  assert.equal(token.isTemporaryArcsAware, false);
  assert.equal(token.statusDocs.some((doc) => doc.path === "OLD.md"), false);
  const result = await processRepository({ id: "fixture", name: "Fixture", absolutePath: root }, { mode: "apply", action: "temporary-arcs-cleanup" });
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.filesChanged, []);
  assert.equal(await readFile(path.join(root, "arcs.yml"), "utf8"), arcs);
  await assert.rejects(readFile(path.join(root, "yaiml.yml")), { code: "ENOENT" });
});

test("missing discovery remains missing", async (t) => {
  const root = await fixture(t);
  const docset = await readYaimlDocset(root);
  assert.equal(docset.manifest, "");
  assert.equal(docset.hasYaiml, false);
  assert.deepEqual(docset.statusDocuments, []);
  assert.equal((await scanFolder(root)).isYaimlAware, false);
});

test("campaign planning and bounded continuation use the relocated memory", async (t) => {
  const root = await fixture(t);
  await writeMap(root, ".yaiml/yaiml.yml");
  await writeFile(path.join(root, "SOT.md"), "# Unrelated fallback\n");
  const project = { id: "fixture", name: "Fixture", absolutePath: root, validation: ["git status review"] };
  const planned = await processRepository(project, { mode: "plan", campaignLens: "yaiml", text: "Plan a YAIML audit" });
  assert.equal(planned.status, "planned");
  assert.ok(planned.campaignHandoff.yaimlDocuments.includes(".yaiml/STATE.md"));
  assert.ok(planned.campaignHandoff.contentSignals.some((signal) => signal.includes('present: .yaiml/STATE.md heading "Declared STATE.md"')));
  assert.equal(planned.campaignHandoff.contentSignals.some((signal) => signal.includes("document missing")), false);
  assert.equal((await scanFolder(root)).statusDocs.find((doc) => doc.exists).path, ".yaiml/STATE.md");
  const applied = await processRepository(project, { mode: "apply", action: "continue-yaiml-checklist" });
  assert.equal(applied.status, "completed");
  assert.deepEqual(applied.filesChanged, [".yaiml/STATE.md"]);
  assert.match(await readFile(path.join(root, ".yaiml/STATE.md"), "utf8"), /ShepAIrd Run Notes/);
  assert.equal(await readFile(path.join(root, "SOT.md"), "utf8"), "# Unrelated fallback\n");
  await assert.rejects(readFile(path.join(root, "STATE.md")), { code: "ENOENT" });
});
