const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stewaird", {
  selectFolders: () => ipcRenderer.invoke("folders:select"),
  workspaceFolders: () => ipcRenderer.invoke("folders:workspace"),
  scanFolders: (paths) => ipcRenderer.invoke("folders:scan", paths),
  runPortfolioCommand: (commandText, options) => ipcRenderer.invoke("portfolio:run", commandText, options),
});
