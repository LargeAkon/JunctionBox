"use strict";
/**
 * 运行时安装引擎
 * ============================================================
 * 流程：下载 → 校验完整性 → 解压 → 结构校验 → 落位
 *
 * 几个刻意的选择：
 *
 * 1. **解压用系统自带 tar.exe（bsdtar）而不是 PowerShell Expand-Archive**
 *    bsdtar 3.5+ 原生支持 zip，实测 190MB 的 JDK 解压 1 秒；Expand-Archive
 *    同类包要 20~40 秒，且它对中文路径与非 ASCII 文件名有历史问题。
 *    系统没有 tar.exe 时才回落到 Expand-Archive。
 *
 * 2. **先解压到 .tmp_xxx，校验通过再 rename 到最终目录**
 *    下载中断 / 包损坏 / 被杀软拦截时，不会在版本列表里留下半个 JDK
 *    让用户以为装好了。
 *
 * 3. **目录名按包内 release 文件生成（如 zulu-17.0.21）**
 *    备用源和主源的大版本相同、小版本不同，用包内真实版本命名才不会出现
 *    「显示 17.0.21、实际 17.0.20」这种对不上的情况。
 *
 * 4. **全程流式 + 可取消**
 *    190MB 走代理要几分钟，不能阻塞主进程，也不能让用户点了没反应。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const UA =
  "JunctionBox/4 (Windows; +https://github.com/LargeAkon/JunctionBox)";

// ---------------------------------------------------------------- 路径
function localBase() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

/**
 * 自定义安装位置：若存在 %APPDATA%\JavaDevTool\runtimes.txt，
 * 就把它第一行当作根目录（C 盘紧张的用户可以指到别的盘）。
 * 没做界面，是因为这属于一次性设置，写一行文本比加一个设置页更省事。
 */
function customBase() {
  const f = path.join(os.homedir(), "AppData", "Roaming", "JavaDevTool", "runtimes.txt");
  try {
    const t = fs.readFileSync(f, "utf8").split(/\r?\n/)[0].trim().replace(/^"|"$/g, "");
    if (t && path.isAbsolute(t)) return t;
  } catch (e) {
    /* ignore */
  }
  return "";
}

/** 版本库根目录：默认 %LOCALAPPDATA%\JavaDevTool\runtimes\<jdk|node> */
function runtimeRoot(kind) {
  const root = customBase() || path.join(localBase(), "JavaDevTool", "runtimes");
  const d = path.join(root, kind === "jdk" ? "jdk" : "node");
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ---------------------------------------------------------------- 任务上下文
const activeJobs = new Map();

function createCtx(id, report) {
  const ctx = {
    id,
    cancelled: false,
    req: null,
    report(p) {
      try {
        report({ id, ...p });
      } catch (e) {
        /* 窗口已关闭时忽略 */
      }
    },
    abort() {
      ctx.cancelled = true;
      try {
        if (ctx.req) ctx.req.destroy(new Error("已取消"));
      } catch (e) {
        /* ignore */
      }
    },
  };
  return ctx;
}

// ---------------------------------------------------------------- 下载
/**
 * 单次 GET。手动跟随重定向：Azul / npmmirror / GitHub Release 都会 302 到 CDN，
 * 直接把 location 当新地址再发一次，避免依赖第三方库。
 */
function downloadOne(url, dest, ctx) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };

    const hop = (u, depth) => {
      if (ctx.cancelled) return done(new Error("已取消"));
      let parsed;
      try {
        parsed = new URL(u);
      } catch (e) {
        return done(new Error("地址无效：" + u));
      }
      if (parsed.protocol !== "https:") return done(new Error("仅支持 https 源"));

      const req = https.get(
        parsed,
        {
          headers: {
            "User-Agent": UA,
            Accept: "*/*",
            // 禁止 gzip：zip 本身已压缩，再压一层会让 content-length 对不上进度
            "Accept-Encoding": "identity",
          },
          timeout: 25000,
        },
        (res) => {
          const code = res.statusCode || 0;

          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (depth >= 6) return done(new Error("重定向过多"));
            return hop(new URL(res.headers.location, parsed).toString(), depth + 1);
          }
          if (code !== 200) {
            res.resume();
            return done(new Error("HTTP " + code));
          }

          const total = Number(res.headers["content-length"] || 0);
          let got = 0;
          let baseGot = 0;
          let baseT = Date.now();
          let speed = 0;
          let lastEmit = 0;

          const ws = fs.createWriteStream(dest);
          res.on("data", (buf) => {
            got += buf.length;
            const now = Date.now();
            if (now - lastEmit >= 140) {
              const dt = (now - baseT) / 1000;
              if (dt >= 0.3) {
                speed = (got - baseGot) / dt;
                baseGot = got;
                baseT = now;
              }
              lastEmit = now;
              ctx.report({
                phase: "download",
                got,
                total,
                speed,
                pct: total ? Math.min(99, Math.round((got / total) * 100)) : 0,
              });
            }
          });
          res.on("aborted", () => done(new Error("连接中断")));
          res.on("error", (e) => done(e));
          ws.on("error", (e) => done(e));
          ws.on("finish", () => {
            if (ctx.cancelled) return done(new Error("已取消"));
            if (total && got !== total) {
              return done(new Error(`下载不完整（${got}/${total} 字节）`));
            }
            done(null);
          });
          res.pipe(ws);
        }
      );

      ctx.req = req;
      req.on("timeout", () => req.destroy(new Error("连接超时")));
      req.on("error", (e) => done(e));
    };

    hop(url, 0);
  });
}

/** 多源依次尝试，任一成功即返回；全失败则抛出最后一个错误 */
async function downloadAny(urls, dest, ctx) {
  let lastErr = null;
  for (let i = 0; i < urls.length; i++) {
    if (ctx.cancelled) throw new Error("已取消");
    try {
      ctx.report({ phase: "download", source: i, pct: 0, got: 0, total: 0, speed: 0 });
      await downloadOne(urls[i], dest, ctx);
      return i;
    } catch (e) {
      lastErr = e;
      try {
        fs.unlinkSync(dest);
      } catch (e2) {
        /* ignore */
      }
      if (ctx.cancelled) throw new Error("已取消");
    }
  }
  throw new Error(lastErr ? lastErr.message : "所有下载源均失败");
}

// ---------------------------------------------------------------- 解压
function psq(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function sysTar() {
  const p = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  return fs.existsSync(p) ? p : "";
}

function extractZip(zip, dest) {
  return new Promise((resolve, reject) => {
    const tar = sysTar();
    const exe = tar || "powershell";
    const args = tar
      ? ["-xf", zip, "-C", dest]
      : [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `Expand-Archive -LiteralPath ${psq(zip)} -DestinationPath ${psq(dest)} -Force`,
        ];

    const p = spawn(exe, args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (b) => (err += b.toString()));
    p.on("error", (e) => reject(new Error("解压失败：" + e.message)));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error("解压失败（退出码 " + code + "）" + (err ? "：" + err.trim().slice(0, 200) : "")));
    });
  });
}

/** zip 通常只有一个顶层目录；若文件直接散在根，则返回 dest 本身 */
function unwrap(dest) {
  const names = fs.readdirSync(dest);
  if (names.length === 1) {
    const p = path.join(dest, names[0]);
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch (e) {
      /* ignore */
    }
  }
  return dest;
}

// ---------------------------------------------------------------- 命名
/**
 * 1.8.0_512 → 8.0.512；21.0.13.0.3 → 21.0.13
 * Azul 会把补丁号写进第四段（21.0.13.0.3），目录名保留三段就够了，
 * 太长会让路径难以辨认。
 */
function normJavaVersion(v) {
  const s = String(v || "").trim();
  const m = s.match(/^1\.(\d+)\.(\d+)(?:[_-](.+))?$/);
  if (m) return `${m[1]}.${m[2]}${m[3] ? "." + m[3] : ""}`;
  const parts = s.split(/[+_]/)[0].split(".");
  return parts.slice(0, 3).join(".");
}

function brandOf(impl) {
  const s = String(impl || "").toLowerCase();
  if (s.includes("azul")) return "zulu";
  if (s.includes("adoptium") || s.includes("temurin")) return "temurin";
  if (s.includes("corretto") || s.includes("amazon")) return "corretto";
  if (s.includes("microsoft")) return "microsoft";
  if (s.includes("bellsoft") || s.includes("liberica")) return "liberica";
  return "jdk";
}

/** 读包内 release 文件生成目录名，例如 zulu-17.0.21 */
function jdkDirName(dir) {
  let ver = "";
  let impl = "";
  try {
    const t = fs.readFileSync(path.join(dir, "release"), "utf8");
    const mv = t.match(/JAVA_VERSION="([^"]*)"/);
    const mi = t.match(/IMPLEMENTOR="([^"]*)"/);
    if (mv) ver = mv[1];
    if (mi) impl = mi[1];
  } catch (e) {
    /* ignore */
  }
  if (!ver) {
    const m = path.basename(dir).match(/(\d+\.\d+[\d._]*)/);
    ver = m ? m[1] : "unknown";
  }
  return `${brandOf(impl)}-${normJavaVersion(ver)}`;
}

function nodeDirName(dir) {
  const m = path.basename(dir).match(/v?(\d+\.\d+\.\d+)/);
  return m ? "v" + m[1] : path.basename(dir);
}

// ---------------------------------------------------------------- 安装 / 卸载
function rmDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 安装一个运行时。
 * @param {"jdk"|"node"} kind
 * @param {object} item catalog 条目
 * @param {function} report 进度回调
 */
async function install(kind, item, report) {
  const ctx = createCtx(item.id, report);
  activeJobs.set(item.id, ctx);

  const root = runtimeRoot(kind);
  const stamp = Date.now();
  const tmp = path.join(root, `.tmp_${item.id}_${stamp}`);
  const zip = path.join(os.tmpdir(), `jbox_${item.id}_${stamp}.zip`);

  try {
    ctx.report({ phase: "download", pct: 0, got: 0, total: 0, speed: 0 });
    const srcIdx = await downloadAny(item.sources, zip, ctx);

    if (ctx.cancelled) throw new Error("已取消");
    ctx.report({ phase: "extract", source: srcIdx });

    fs.mkdirSync(tmp, { recursive: true });
    await extractZip(zip, tmp);

    const inner = unwrap(tmp);
    const probe =
      kind === "jdk"
        ? path.join(inner, "bin", "java.exe")
        : path.join(inner, "node.exe");
    if (!fs.existsSync(probe)) {
      throw new Error("压缩包结构异常，未找到 " + path.basename(probe));
    }

    const name = kind === "jdk" ? jdkDirName(inner) : nodeDirName(inner);
    const finalPath = path.join(root, name);

    // 同版本重装：先清掉旧目录，避免 rename 失败
    if (fs.existsSync(finalPath)) rmDir(finalPath);
    fs.renameSync(inner, finalPath);
    if (fs.existsSync(tmp)) rmDir(tmp);

    ctx.report({ phase: "done", path: finalPath, name, source: srcIdx });
    return { ok: true, path: finalPath, name };
  } catch (e) {
    const msg = String((e && e.message) || e);
    ctx.report({ phase: ctx.cancelled ? "cancelled" : "error", error: msg });
    return { ok: false, err: msg, cancelled: ctx.cancelled };
  } finally {
    activeJobs.delete(item.id);
    try {
      fs.unlinkSync(zip);
    } catch (e) {
      /* ignore */
    }
    if (fs.existsSync(tmp)) rmDir(tmp);
  }
}

function cancel(id) {
  const ctx = activeJobs.get(id);
  if (!ctx) return false;
  ctx.abort();
  return true;
}

/** 只允许删除版本库自己的目录，且不能是联接 */
function uninstall(kind, dir) {
  const root = path.resolve(runtimeRoot(kind));
  const p = path.resolve(String(dir || ""));
  const rel = path.relative(root, p);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, err: "只能删除版本库内的目录" };
  }
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    return { ok: false, err: "目录不存在" };
  }
  if (st.isSymbolicLink()) return { ok: false, err: "这是一个联接，已拒绝删除" };
  if (!rmDir(p)) return { ok: false, err: "删除失败，可能有进程正在使用（请先切换版本并关闭终端）" };
  return { ok: true };
}

/**
 * 清理上次异常退出留下的临时目录（进程被强杀时 finally 不会执行）。
 * 只删超过 1 小时的，避免误删正在进行的解压。
 */
function cleanStale(kind) {
  const root = runtimeRoot(kind);
  const now = Date.now();
  try {
    for (const n of fs.readdirSync(root)) {
      if (!n.startsWith(".tmp_")) continue;
      const p = path.join(root, n);
      try {
        if (now - fs.statSync(p).mtimeMs > 3600e3) rmDir(p);
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    /* ignore */
  }
}

/** 列出已安装在该类型版本库里的目录 */
function installed(kind) {  const root = runtimeRoot(kind);
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch (e) {
    return out;
  }
  for (const n of names) {
    if (n.startsWith(".tmp_")) continue;
    const p = path.join(root, n);
    const probe = kind === "jdk" ? path.join(p, "bin", "java.exe") : path.join(p, "node.exe");
    if (fs.existsSync(probe)) out.push(p);
  }
  return out;
}

module.exports = {
  runtimeRoot,
  install,
  cancel,
  uninstall,
  installed,
  cleanStale,
  normJavaVersion,
  brandOf,
};
