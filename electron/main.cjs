"use strict";
const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const core = require("./core.cjs");
const catalog = require("./catalog.cjs");
const installer = require("./installer.cjs");

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

        // 版本库面板：切到 JDK 页 → 点「版本库」→ 截图
        await win.webContents.executeJavaScript(
          `document.querySelectorAll('.navitem')[1]?.click(); true;`
        );
        await new Promise((r) => setTimeout(r, 700));
        await win.webContents
          .executeJavaScript(
            `(() => {
              const b = [...document.querySelectorAll('.btn')].find((x) => x.innerText.trim() === '版本库');
              if (b) b.click();
              return { found: !!b, open: !!(window.__JDT && window.__JDT.store.open) };
            })()`
          )
          .then((v) => console.log("[store]", JSON.stringify(v)));
        await new Promise((r) => setTimeout(r, 1600));
        const shot5 = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, "5-store.png"), shot5.toPNG());

        // 安装选址对话框：点第一个未安装版本的「安装」，只截图不确认
        const clicked = await win.webContents
          .executeJavaScript(
            `(() => {
              const rows = [...document.querySelectorAll('.rows .row')];
              for (const row of rows) {
                const b = [...row.querySelectorAll('button')].find((x) => x.innerText.trim() === '安装');
                if (b) { b.click(); return { ok: true, row: row.innerText.replace(/\\s+/g, ' ').slice(0, 40) }; }
              }
              return { ok: false, rows: rows.length };
            })()`
          )
          .catch((e) => ({ err: String(e) }));
        console.log("[ask]", JSON.stringify(clicked));
        await new Promise((r) => setTimeout(r, 3200));
        const askState = await win.webContents
          .executeJavaScript(`(() => {
            const a = window.__JDT && window.__JDT.store.ask;
            if (!a) return "null";
            return JSON.stringify({ mode: a.mode, label: a.label, suggested: a.suggested && a.suggested.root, count: a.suggested && a.suggested.count, defaultRoot: a.defaultRoot, current: a.current });
          })()`)
          .catch((e) => "err " + String(e));
        console.log("[ask] state", JSON.stringify(askState));
        const shot6 = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, "6-location.png"), shot6.toPNG());
        const errs = await win.webContents
          .executeJavaScript("(window.__errs || []).slice(0, 6)")
          .catch(() => []);
        console.log("[store] errs", JSON.stringify(errs));
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

// ---------------------------------------------------------------- 版本库
const major = (v) => String(v || "").replace(/^1\./, "").split(/[._]/)[0];

/**
 * 版本库列表 = 内置清单 + 本机已装情况。
 * 匹配按「大版本」算：用户已有 Temurin 17.0.20 时，清单里的 JDK 17 显示为
 * 「已安装 17.0.20」，不会再让人多下 190MB 装一个功能完全一样的 17.0.21。
 * managed = 这个目录由本程序安装（决定「删除」按钮是否出现，用户自己的 JDK 永不出现）。
 */
ipcMain.handle("store:list", async () => {
  installer.cleanStale("jdk");
  installer.cleanStale("node");
  const [jdks, nodes] = await Promise.all([core.findJdks(), core.findNodes()]);
  const build = (kind, arr) =>
    catalog.list(kind).map((it) => {
      const hit = arr.find((x) => major(x.ver) === String(it.feature));
      return {
        ...it,
        installedPath: hit ? hit.path : "",
        installedVer: hit ? hit.ver : "",
        managed: hit ? installer.isManaged(kind, hit.path) : false,
      };
    });
  return {
    jdk: build("jdk", jdks),
    node: build("node", nodes),
    roots: { jdk: installer.rootOf("jdk"), node: installer.rootOf("node") },
    customRoot: { jdk: installer.rootIsCustom("jdk"), node: installer.rootIsCustom("node") },
    defaultRoot: { jdk: installer.defaultRoot("jdk"), node: installer.defaultRoot("node") },
  };
});

/**
 * 点「安装」前的选址建议。
 * 从用户机器上已有的 JDK / Node 反推他习惯把版本放在哪，
 * 例如 JDK 17 在 E:\develop\Java\jdk17 → 建议 JDK 25 装进 E:\develop\Java。
 */
ipcMain.handle("store:plan", async (_e, kind) => {
  const k = kind === "node" ? "node" : "jdk";
  const dirs = k === "jdk" ? (await core.findJdks()).map((x) => x.path) : (await core.findNodes()).map((x) => x.path);
  return {
    kind: k,
    suggested: installer.suggestRoot(k, dirs),
    root: installer.rootOf(k),
    custom: installer.rootIsCustom(k),
    defaultRoot: installer.defaultRoot(k),
    found: dirs.length,
  };
});

/** 记住安装位置（勾了「以后都装到这里」才调用） */
ipcMain.handle("store:set-root", async (_e, kind, dir) => {
  const k = kind === "node" ? "node" : "jdk";
  if (!dir) {
    installer.setRoot(k, "");
    return { ok: true, root: installer.rootOf(k) };
  }
  const c = installer.checkRoot(k, dir);
  if (!c.ok) return c;
  if (!installer.setRoot(k, c.path)) return { ok: false, err: "写入配置失败，请检查磁盘权限" };
  // 加进扫描路径：以后即使用户换回别的位置，这个目录里的版本仍然会被列出来
  const file = k === "jdk" ? "paths.txt" : "node_paths.txt";
  const list = core.loadManual(file);
  if (!list.some((x) => path.normalize(x).toLowerCase() === path.normalize(c.path).toLowerCase())) {
    list.push(path.normalize(c.path));
    core.saveManual(list, file);
  }
  return { ok: true, root: installer.rootOf(k) };
});

/** 弹出目录选择框，默认停在建议的位置 */
ipcMain.handle("store:pick-root", async (_e, kind, current) => {
  const k = kind === "node" ? "node" : "jdk";
  const start = String(current || "") || installer.rootOf(k);
  const r = await dialog.showOpenDialog(win, {
    title: k === "jdk" ? "选择 JDK 的安装位置（版本会装在它下面的子目录里）" : "选择 Node 的安装位置（版本会装在它下面的子目录里）",
    properties: ["openDirectory", "createDirectory"],
    defaultPath: fs.existsSync(start) ? start : undefined,
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, cancelled: true };
  return { ok: true, path: path.normalize(r.filePaths[0]) };
});

// 同一时刻只跑一个安装：并发下载会互相抢带宽，进度也没法看
let installing = "";
ipcMain.handle("store:install", async (_e, kind, id, root, remember) => {
  if (installing) return { ok: false, err: "已有版本正在安装，请等它完成" };
  const k = kind === "node" ? "node" : "jdk";
  const item = catalog.find(k, id);
  if (!item) return { ok: false, err: "清单里没有这个版本" };

  // 安装位置：先校验再动手，避免下载 190MB 之后才发现目录不可写
  const c = installer.checkRoot(k, root || installer.rootOf(k));
  if (!c.ok) return { ok: false, err: c.err };

  if (remember) {
    installer.setRoot(k, c.path);
  }
  const file = k === "jdk" ? "paths.txt" : "node_paths.txt";
  const list = core.loadManual(file);
  if (!list.some((x) => path.normalize(x).toLowerCase() === path.normalize(c.path).toLowerCase())) {
    list.push(path.normalize(c.path));
    core.saveManual(list, file);
  }

  installing = id;
  try {
    const r = await installer.install(k, item, (p) => {
      if (win && !win.isDestroyed()) win.webContents.send("install:progress", p);
    }, { root: c.path });
    return r;
  } finally {
    installing = "";
  }
});

ipcMain.handle("store:cancel", (_e, id) => ({ ok: installer.cancel(id) }));

ipcMain.handle("store:remove", (_e, kind, dir) => {
  const link = kind === "jdk" ? core.jdkLink() : core.nodeLink();
  const active = core.linkTarget(link);
  const same = (a, b) => a && b && path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
  if (same(active, dir)) return { ok: false, err: "该版本正在使用，请先切换到其他版本" };
  return installer.uninstall(kind, dir);
});

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
