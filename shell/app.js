import { makeSummaryChips, renderDetailHtml, renderTokenStripHtml } from "../src/intakeView.mjs";

const dropZone = document.querySelector("#drop-zone");
const selectButton = document.querySelector("#select-folders");
const workspaceButton = document.querySelector("#scan-workspace");
const scanCount = document.querySelector("#scan-count");
const patternBar = document.querySelector("#pattern-bar");
const tokenStrip = document.querySelector("#token-strip");
const detailPanel = document.querySelector("#detail-panel");
const portfolioCommand = document.querySelector("#portfolio-command");
const commandOutput = document.querySelector("#command-output");
const inspectButton = document.querySelector("#run-inspect");
const planButton = document.querySelector("#run-plan");
const applyButton = document.querySelector("#run-apply");

let currentScan = { selectedCount: 0, projects: [], aggregate: {} };
let selectedId = "";

render();

selectButton.addEventListener("click", async () => {
  const paths = await window.shepaird.selectFolders();
  await scan(paths);
});

workspaceButton.addEventListener("click", async () => {
  scanCount.textContent = "Locating workspace fleet...";
  const paths = await window.shepaird.workspaceFolders();
  await scan(paths);
});

inspectButton.addEventListener("click", () => runPortfolio("inspect"));
planButton.addEventListener("click", () => runPortfolio("plan"));
applyButton.addEventListener("click", () => runPortfolio("apply"));

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const paths = [...event.dataTransfer.files]
    .map((file) => file.path)
    .filter(Boolean);

  if (!paths.length) {
    scanCount.textContent = "Drop did not expose folder paths. Use Select folders.";
    return;
  }

  await scan(paths);
});

tokenStrip.addEventListener("click", (event) => {
  const token = event.target.closest("[data-project-id]");
  if (!token) {
    return;
  }
  selectedId = token.dataset.projectId;
  render();
});

async function scan(paths) {
  if (!paths?.length) {
    return;
  }
  scanCount.textContent = `Scanning ${paths.length} folder${paths.length === 1 ? "" : "s"}...`;
  currentScan = await window.shepaird.scanFolders(paths);
  selectedId = currentScan.projects[0]?.id ?? "";
  render();
}

async function runPortfolio(mode) {
  const text = portfolioCommand.value.trim();
  if (!text) {
    commandOutput.textContent = "Enter a portfolio command first.";
    return;
  }
  commandOutput.textContent = `Running ${mode} command...`;
  try {
    const run = await window.shepaird.runPortfolioCommand(text, { mode });
    commandOutput.textContent = summarizeRun(run);
  } catch (error) {
    commandOutput.textContent = error?.message ?? String(error);
  }
}

function summarizeRun(run) {
  const lines = [
    `Run ${run.id}`,
    `Mode: ${run.mode}`,
    `Action: ${run.action}`,
    `Selected: ${run.selectedRepositories.join(", ") || "none"}`,
    `Summary: completed ${run.summary.completed}, inspected ${run.summary.inspected}, planned ${run.summary.planned}, blocked ${run.summary.blocked}, skipped ${run.summary.skipped}`,
  ];
  for (const repo of run.repositories) {
    lines.push(`${repo.name}: ${repo.status}${repo.blockers?.length ? ` - ${repo.blockers.join("; ")}` : ""}`);
  }
  if (run.recordPaths?.markdownPath) {
    lines.push(`Record: ${run.recordPaths.markdownPath}`);
  }
  return lines.join("\n");
}

function render() {
  const chips = makeSummaryChips(currentScan);
  scanCount.textContent = currentScan.selectedCount
    ? `${currentScan.selectedCount} folder${currentScan.selectedCount === 1 ? "" : "s"} scanned`
    : "No folders scanned.";
  patternBar.innerHTML = chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("");
  tokenStrip.innerHTML = renderTokenStripHtml(currentScan, selectedId);
  detailPanel.innerHTML = renderDetailHtml(currentScan.projects.find((project) => project.id === selectedId));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
