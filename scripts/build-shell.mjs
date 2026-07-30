import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSummaryChips, renderDetailHtml, renderTokenStripHtml } from "../src/intakeView.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "shell/index.html",
  "shell/app.js",
  "shell/styles.css",
  "shell/main.mjs",
  "shell/preload.cjs",
  "src/intake.mjs",
  "src/intakeView.mjs",
  "src/portfolio.mjs",
];

for (const relativePath of requiredFiles) {
  await fs.access(path.join(root, relativePath));
}

const mockScan = {
  selectedCount: 1,
  aggregate: {
    selectedCount: 1,
    yaimlAwareCount: 1,
    temporaryArcsAwareCount: 0,
    legacyYaimlAwareCount: 0,
    dirtyCount: 0,
    missingStateDocCount: 0,
    missingMaintainerDocCount: 0,
    capabilityCounts: { "yaiml-project-memory": 1 },
  },
  projects: [{
    id: "sample",
    name: "Sample",
    absolutePath: root,
    isGitRepo: false,
    gitDirty: false,
    isTemporaryArcsAware: false,
    isLegacyYaimlAware: false,
    isYaimlAware: true,
    statusDocs: [{ path: "SOT.md", exists: true, heading: "Sample State" }],
    arcsDocs: [],
    yaimlDocs: [{ path: "yaiml.yml", exists: true, heading: "" }],
    maintainerDocs: [],
    capabilityHints: ["yaiml-project-memory"],
    dirtySample: [],
    warnings: [],
  }],
};

if (!renderTokenStripHtml(mockScan).includes("Sample")) {
  throw new Error("Token strip render smoke failed.");
}
if (!renderDetailHtml(mockScan.projects[0]).includes("Sample State")) {
  throw new Error("Detail render smoke failed.");
}
if (!makeSummaryChips(mockScan).some((chip) => chip.includes("YAIML-aware"))) {
  throw new Error("Summary chip smoke failed.");
}

console.log("ShepAIrd thin intake shell build check passed.");
