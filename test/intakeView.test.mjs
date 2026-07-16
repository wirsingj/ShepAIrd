import assert from "node:assert/strict";
import test from "node:test";
import { makeSummaryChips, renderDetailHtml, renderTokenStripHtml } from "../src/intakeView.mjs";

test("renders token strip and detail view from mock scan", () => {
  const scan = {
    selectedCount: 3,
    aggregate: {
      selectedCount: 3,
      yaimlAwareCount: 2,
      dirtyCount: 1,
      missingStateDocCount: 1,
      missingMaintainerDocCount: 2,
      capabilityCounts: {
        "provider-adapter": 2,
      },
    },
    projects: [
      project("yaiml", "YAIML", true, false),
      project("dirty-app", "Dirty App", true, true),
      project("plain", "Plain Folder", false, false),
    ],
  };

  const strip = renderTokenStripHtml(scan, "dirty-app");
  assert.match(strip, /YAIML/);
  assert.match(strip, /Dirty App/);
  assert.match(strip, /Plain Folder/);
  assert.match(strip, /selected/);

  const detail = renderDetailHtml(scan.projects[1]);
  assert.match(detail, /Dirty App/);
  assert.match(detail, /Inspect dirty work/);

  const chips = makeSummaryChips(scan);
  assert.ok(chips.includes("3 folders scanned"));
  assert.ok(chips.includes("2 YAIML-aware"));
  assert.ok(chips.includes("provider-adapter appears in 2"));
});

function project(id, name, isYaimlAware, gitDirty) {
  return {
    id,
    name,
    absolutePath: `C:\\example\\${id}`,
    isGitRepo: true,
    gitDirty,
    isArcsAware: isYaimlAware,
    isTemporaryArcsAware: false,
    isLegacyYaimlAware: false,
    isYaimlAware,
    statusDocs: isYaimlAware ? [{ path: "SOT.md", exists: true, heading: `${name} State` }] : [],
    arcsDocs: [],
    yaimlDocs: isYaimlAware ? [{ path: "yaiml.yml", exists: true, heading: "" }] : [],
    maintainerDocs: [],
    capabilityHints: isYaimlAware ? ["provider-adapter"] : [],
    dirtySample: gitDirty ? [" M src/app.js"] : [],
    warnings: [],
  };
}
