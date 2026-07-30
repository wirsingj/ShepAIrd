import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanFolders } from "../src/intake.mjs";
import { runPortfolioCommand } from "../src/portfolio.mjs";

const shellDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(shellDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..");

async function createWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    title: "ShepAIrd Intake",
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(shellDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await window.loadFile(path.join(shellDir, "index.html"));
}

ipcMain.handle("folders:select", async () => {
  const result = await dialog.showOpenDialog({
    title: "Select repo folders",
    properties: ["openDirectory", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("folders:scan", async (_event, paths) => {
  return scanFolders(paths);
});

ipcMain.handle("folders:workspace", async () => {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const folderPath = path.join(workspaceRoot, entry.name);
    if (await hasProjectSignal(folderPath)) {
      candidates.push(folderPath);
    }
  }
  return candidates.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
});

ipcMain.handle("portfolio:run", async (_event, commandText, options = {}) => {
  return runPortfolioCommand(commandText, options);
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function hasProjectSignal(folderPath) {
  const signals = [
    ".git",
    "arcs.yml",
    "arcs.yaml",
    "yaiml.yml",
    "yaiml.yaml",
    "SOT.md",
    "STATUS.md",
    "README.md",
    "package.json",
    "go.mod",
    "pyproject.toml",
    "Cargo.toml",
  ];
  for (const signal of signals) {
    try {
      await fs.access(path.join(folderPath, signal));
      return true;
    } catch {
      // Keep checking other project signals.
    }
  }
  return false;
}
