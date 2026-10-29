"use strict";
const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const core = require("./core.cjs");

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const APP_NAME = "JunctionBox";
// 直接用 package.json 里的版本，避免和构建产物对不上
const APP_VERSION = app.getVersion();

/** Windows 11 22000+ 才支持 Mica 云母材质 */
function supportsMica() {
  try {
    const build = parseInt(String(os.release()).split(".")[2] || "0", 10);
    return build >= 22000;
  } catch (e) {
    return false;
  }
}

let win = null;

// 软件渲染兜底：
// 某些虚拟机 / 远程桌面 / 老旧显卡驱动下，Chromium 的 GPU 进程会反复崩溃
// 并且直接 FATAL 退出（用户侧表现就是双击没反应）。
// 这里用启动计数器做自愈：连续两次异常退出后自动永久关闭硬件加速。
let softMode = false;
(function hardwareFallback() {
  const dir = path.join(process.env.APPDATA || os.homedir(), "java-dev-tool");
  const flag = path.join(dir, ".nogpu");
  const boot = path.join(dir, "boot.json");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) { /* ignore */ }

  let attempts = 0;
  let ready = false;
  try {
    const st = JSON.parse(fs.readFileSync(boot, "utf8"));
    attempts = st.attempts || 0;
    ready = !!st.ready;
  } catch (e) { /* 首次运行 */ }

  // 上一次没能完成首帧渲染就退出了 → 判定为失败启动，只容忍一次
  if (!ready) attempts += 1;

  if (process.env.JDT_SOFT || fs.existsSync(flag) || attempts >= 1) {
    softMode = true;
    try { fs.writeFileSync(flag, "1"); } catch (e) {}
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
    app.commandLine.appendSwitch("in-process-gpu");
  }
  try {
    fs.writeFileSync(boot, JSON.stringify({ attempts, ready: false }));
  } catch (e) {}
})();

/** 首帧渲染成功后标记为健康启动，清零失败计数 */
function markHealthy() {
  try {
    const f = path.join(process.env.APPDATA || os.homedir(), "java-dev-tool", "boot.json");
    fs.writeFileSync(f, JSON.stringify({ attempts: 0, ready: true }));
  } catch (e) { /* ignore */ }
}

function createWindow() {
  const mica = supportsMica();

  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1000,
    minHeight: 640,
    show: false,                       // 先不显示，等渲染完再 show，避免白屏闪烁
    frame: false,                      // 自绘标题栏
    backgroundColor: mica ? "#00000000" : (nativeTheme.shouldUseDarkColors ? "#202020" : "#f3f3f3"),
    ...(mica ? { backgroundMaterial: "mica", visualEffectState: "followWindow" } : {}),
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);

  // 调试模式：把渲染进程的日志与加载失败转发到主进程输出
  if (process.env.JDT_DEBUG) {
    win.webContents.on("console-message", (...a) => {
      const d = a[1];
      if (d && typeof d === "object" && "message" in d) {
        console.log(`[renderer:${d.level}] ${d.message}`);
      } else {
        console.log(`[renderer:${a[1]}] ${a[2]}`);
      }
    });
    win.webContents.on("did-fail-load", (_e, code, desc, url) =>
      console.error("[did-fail-load]", code, desc, url)
    );
    win.webContents.on("render-process-gone", (_e, d) =>
      console.error("[render-process-gone]", JSON.stringify(d))
    );
  }

  // 截图模式：JDT_SHOT=<目录> 时依次截取各页签后退出，用于视觉验收
  if (process.env.JDT_SHOT) {
    const outDir = process.env.JDT_SHOT;
    const shots = ["ports", "jdk", "node", "about"];
    win.webContents.once("did-finish-load", async () => {
      try {
        fs.mkdirSync(outDir, { recursive: true });
        await new Promise((r) => setTimeout(r, 3000));
        await win.webContents.executeJavaScript(`
          window.__errs = [];
          window.addEventListener('error', (e) => window.__errs.push('ERR ' + e.message));
          window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ ' + e.reason));
          true;
        `);
        for (let i = 0; i < shots.length; i++) {
          await win.webContents.executeJavaScript(`
            (() => {
              const bs = [...document.querySelectorAll('.navitem')];
              const b = bs[${i}];
              if (b) b.click();
              return {
                clicked: b ? b.innerText.trim() : null,
                view: window.__JDT ? window.__JDT.view : 'noStore',
              };
            })()
          `).then((v) => console.log(`[click ${i}]`, JSON.stringify(v)));
          await new Promise((r) => setTimeout(r, 1500));
          const dbg = await win.webContents.executeJavaScript(`
            (() => {
              const bs = [...document.querySelectorAll('.navitem')];
              const p = document.querySelector('.page');
              return {
                view: window.__JDT ? window.__JDT.view : 'noStore',
                nav: bs.map((b) => (b.className.includes('on') ? 'ON' : '-')).join(''),
                text: p ? (p.innerText || '').replace(/\\s+/g, ' ').slice(0, 30) : null,
                errs: (window.__errs || []).slice(0, 4),
              };
            })()
          `).catch((e) => ({ err: String(e) }));
          console.log("[shot]", shots[i], JSON.stringify(dbg));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(outDir, `${i + 1}-${shots[i]}.png`), img.toPNG());
        }
      } catch (e) {
        console.error("[shot] failed", e);
      }
      app.exit(0);
    });
  }

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  // 内容就绪后再显示，配合 CSS 淡入，实现「无闪烁启动」
  win.once("ready-to-show", () => {
    win.show();
    markHealthy();
    win.webContents.send("win:state", { maximized: win.isMaximized() });
  });

  const pushState = () => {
    if (win && !win.isDestroyed()) win.webContents.send("win:state", { maximized: win.isMaximized() });
  };
  win.on("maximize", pushState);
  win.on("unmaximize", pushState);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ---------------------------------------------------------------- IPC
ipcMain.handle("meta:info", () => ({
  name: APP_NAME,
  version: APP_VERSION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  mica: supportsMica() && !softMode,
  soft: softMode,
  dark: nativeTheme.shouldUseDarkColors,
  os: `${os.type()} ${os.release()}`,
  home: os.homedir(),
  npmPrefix: path.join(os.homedir(), "AppData", "Roaming", "npm"),
}));

ipcMain.handle("ports:scan", () => core.scanPorts());
ipcMain.handle("ports:kill", (_e, pid) => core.killProcess(pid));
ipcMain.handle("env:snapshot", () => core.snapshot());

// 同一时刻只允许一个切换在跑：
// 双击 / 连点会排队开出好几份 PowerShell，各自改写同一份注册表，
// 轻则互相覆盖出错，重则让程序长时间无响应被系统杀掉。
let switching = false;
async function guardedSwitch(fn) {
  if (switching) return { ok: false, out: "正在切换中，请稍候再试" };
  switching = true;
  try {
    return await fn();
  } catch (e) {
    return { ok: false, out: String((e && e.message) || e) };
  } finally {
    switching = false;
  }
}
ipcMain.handle("jdk:switch", (_e, p) => guardedSwitch(() => core.switchJdk(p)));
ipcMain.handle("node:switch", (_e, p) => guardedSwitch(() => core.switchNode(p)));

ipcMain.handle("path:add", (_e, kind, dir) => {
  const file = kind === "jdk" ? "paths.txt" : "node_paths.txt";
  const probe = kind === "jdk"
    ? path.join(dir, "bin", "java.exe")
    : path.join(dir, "node.exe");
  if (!fs.existsSync(probe)) return { ok: false, err: `该目录下没有 ${path.basename(probe)}` };
  const list = core.loadManual(file);
  list.push(path.normalize(dir));
  core.saveManual(list, file);
  return { ok: true };
});

ipcMain.handle("path:remove", (_e, kind, dir) => {
  const file = kind === "jdk" ? "paths.txt" : "node_paths.txt";
  const list = core.loadManual(file).filter((p) => p.toLowerCase() !== String(dir).toLowerCase());
  core.saveManual(list, file);
  return { ok: true };
});

ipcMain.handle("dialog:dir", async (_e, kind) => {
  const r = await dialog.showOpenDialog(win, {
    title: kind === "jdk" ? "选择 JDK 目录（需包含 bin\\java.exe）" : "选择 Node 目录（需包含 node.exe）",
    properties: ["openDirectory"],
  });
  if (r.canceled || !r.filePaths.length) return "";
  let p = path.normalize(r.filePaths[0]);
  if (kind === "jdk" && !fs.existsSync(path.join(p, "bin", "java.exe")) &&
      fs.existsSync(path.join(p, "jdk", "bin", "java.exe"))) {
    p = path.join(p, "jdk");
  }
  return p;
});

ipcMain.on("win:minimize", () => win && win.minimize());
ipcMain.on("win:toggleMax", () => {
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on("win:close", () => win && win.close());

ipcMain.handle("shell:open", (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---------------------------------------------------------------- 生命周期
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId("com.github.largeakon.junctionbox");
    createWindow();
    nativeTheme.on("updated", () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("theme:changed", { dark: nativeTheme.shouldUseDarkColors });
      }
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
