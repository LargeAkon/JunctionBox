"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  info: () => ipcRenderer.invoke("meta:info"),
  scanPorts: () => ipcRenderer.invoke("ports:scan"),
  kill: (pid) => ipcRenderer.invoke("ports:kill", pid),
  snapshot: () => ipcRenderer.invoke("env:snapshot"),
  switchJdk: (p) => ipcRenderer.invoke("jdk:switch", p),
  switchNode: (p) => ipcRenderer.invoke("node:switch", p),
  addPath: (kind, dir) => ipcRenderer.invoke("path:add", kind, dir),
  removePath: (kind, dir) => ipcRenderer.invoke("path:remove", kind, dir),
  pickDir: (kind) => ipcRenderer.invoke("dialog:dir", kind),
  open: (url) => ipcRenderer.invoke("shell:open", url),
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMax: () => ipcRenderer.send("win:toggleMax"),
  close: () => ipcRenderer.send("win:close"),
  onWinState: (cb) => ipcRenderer.on("win:state", (_e, d) => cb(d)),
  onTheme: (cb) => ipcRenderer.on("theme:changed", (_e, d) => cb(d)),
});
