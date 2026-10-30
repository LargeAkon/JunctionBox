"use strict";
const { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell, session } = require("electron");
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

// ---------------------------------------------------------------- 设置
// 只存主题偏好这类单值设置，放 %APPDATA%\JavaDevTool\settings.json
function settingsFile() {
  return path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "JavaDevTool",
    "settings.json"
  );
}

function readSettings() {
  try {
    const v = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    return {};
  }
}

function writeSettings(patch) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    const next = { ...readSettings(), ...patch };
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

const THEME_MODES = ["light", "dark", "system"];
function themeMode() {
  const m = String(readSettings().theme || "light");
  return THEME_MODES.includes(m) ? m : "light";
}
/** 窗口底色：纯白 / 近黑，避免深色模式下启动闪一下白屏 */
const surface = (dark) => (dark ? "#0d0d10" : "#ffffff");

function syncWindowChrome() {
  if (!win || win.isDestroyed()) return;
  const dark = nativeTheme.shouldUseDarkColors;
  try {
    win.setBackgroundColor(surface(dark));
  } catch (e) {
    /* ignore */
  }
  win.webContents.send("theme:changed", { dark, mode: themeMode() });
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
  win = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 1000,
    minHeight: 640,
    show: false,                       // 先不显示，等渲染完再 show，避免白屏闪烁
    frame: false,                      // 自绘标题栏
    backgroundColor: surface(nativeTheme.shouldUseDarkColors),
    roundedCorners: true,
    autoHideMenuBar: true,
    title: APP_NAME,
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
  if (process.env.JDT_DEBUG) {    win.webContents.on("console-message", (...a) => {
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

  // 临时求值：JDT_EVAL="<js 表达式>" 时在页面里跑一次并打印结果，用于核对真实 DOM。
  // 和截图模式一样只在开发时用，正常启动完全不受影响。
  if (process.env.JDT_EVAL && !process.env.JDT_SHOT) {
    win.webContents.once("did-finish-load", async () => {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const v = await win.webContents.executeJavaScript(process.env.JDT_EVAL);
        console.log("[eval]", typeof v === "string" ? v : JSON.stringify(v));
      } catch (e) {
        console.error("[eval] failed", e);
      }
      app.exit(0);
    });
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

        // 夜间模式：点右上角外观按钮，截一张端口页，再切回浅色
        const themed = await win.webContents
          .executeJavaScript(
            `(() => { const bs=[...document.querySelectorAll('.navitem')]; bs[0]?.click(); const b=document.querySelector('.tbtn'); if(b) b.click(); return !!b; })()`
          )
          .catch(() => false);
        console.log("[theme]", JSON.stringify(themed));
        await new Promise((r) => setTimeout(r, 900));
        fs.writeFileSync(
          path.join(outDir, "5-dark.png"),
          (await win.webContents.capturePage()).toPNG()
        );
        await win.webContents
          .executeJavaScript(`document.querySelector('.tbtn')?.click(); true;`)
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 400));

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
  });

  const pushState = () => {
    if (win && !win.isDestroyed()) win.webContents.send("win:state", { maximized: win.isMaximized() });
  };
  win.on("maximize", pushState);
  win.on("unmaximize", pushState);
  win.webContents.on("did-finish-load", pushState);

  // ---------------------------------------------------------------- 安全边界
  // 应用里没有任何需要外链的能力，所以只放行 http(s)，其余协议一律不交给系统。
  // 以前是「收到什么就 openExternal 什么」，等于把 file://、ms-settings:、
  // 甚至自定义协议的处理权交给了页面内容。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // 页面本身不允许被导航走：拖进一个 HTML 文件、或将来某处渲染了链接，
  // 都不该让渲染进程离开本地页面（preload 暴露的 API 还在上下文里）。
  win.webContents.on("will-navigate", (e, url) => {
    const dev = process.env.VITE_DEV_SERVER_URL || "";
    if (url === win.webContents.getURL()) return;
    if (dev && url.startsWith(dev)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
}

// ---------------------------------------------------------------- IPC
ipcMain.handle("meta:info", () => ({
  name: APP_NAME,
  version: APP_VERSION,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  soft: softMode,
  dark: nativeTheme.shouldUseDarkColors,
  theme: themeMode(),
  os: `${os.type()} ${os.release()}`,
  home: os.homedir(),
  npmPrefix: path.join(os.homedir(), "AppData", "Roaming", "npm"),
  settingsPath: settingsFile(),
}));

// ---------------------------------------------------------------- 外观
ipcMain.handle("theme:get", () => ({ mode: themeMode(), dark: nativeTheme.shouldUseDarkColors }));

ipcMain.handle("theme:set", (_e, mode) => {
  const m = THEME_MODES.includes(String(mode)) ? String(mode) : "light";
  writeSettings({ theme: m });
  nativeTheme.themeSource = m;
  syncWindowChrome();
  return { ok: true, mode: m, dark: nativeTheme.shouldUseDarkColors };
});

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
  const k = kind === "node" ? "node" : "jdk";
  if (typeof dir !== "string" || !path.isAbsolute(dir)) {
    return { ok: false, err: "路径无效" };
  }
  const link = k === "jdk" ? core.jdkLink() : core.nodeLink();
  const active = core.linkTarget(link);
  const same = (a, b) => a && b && path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
  if (same(active, dir)) return { ok: false, err: "正在使用，先切到别的版本" };
  return installer.uninstall(k, dir);
});

/** 目录必须是绝对路径，否则写进 paths.txt 的会是一条永远扫不到的死路径 */
const validDir = (d) => typeof d === "string" && d.length > 0 && path.isAbsolute(d);

ipcMain.handle("path:add", (_e, kind, dir) => {
  if (!validDir(dir)) return { ok: false, err: "路径无效，请选择完整目录" };
  const k = kind === "node" ? "node" : "jdk";
  const file = k === "jdk" ? "paths.txt" : "node_paths.txt";
  const probe = k === "jdk" ? path.join(dir, "bin", "java.exe") : path.join(dir, "node.exe");
  if (!fs.existsSync(probe)) return { ok: false, err: `该目录下没有 ${path.basename(probe)}` };
  const list = core.loadManual(file);
  list.push(path.normalize(dir));
  core.saveManual(list, file);
  return { ok: true };
});

ipcMain.handle("path:remove", (_e, kind, dir) => {
  if (!validDir(dir)) return { ok: false, err: "路径无效" };
  const k = kind === "node" ? "node" : "jdk";
  const file = k === "jdk" ? "paths.txt" : "node_paths.txt";
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

// ready-to-show 里发的 win:state 早于渲染进程挂监听，会丢；
// 所以界面起来后主动拉一次真实状态，否则最大化启动时图标是错的。
ipcMain.handle("win:state", () => ({ maximized: !!(win && win.isMaximized()) }));

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

    // 主题：默认纯白，可在界面右上角切成夜间模式（偏好写进 settings.json）
    nativeTheme.themeSource = themeMode();
    nativeTheme.on("updated", syncWindowChrome);

    // 这个程序不需要摄像头、麦克风、通知、地理位置等任何网页能力，
    // 一律拒绝，避免将来某处内容触发系统授权弹窗。
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
