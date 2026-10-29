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

// ---------------------------------------------------------------- 配置目录
function localBase() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

function cfgDir() {
  const d = path.join(os.homedir(), "AppData", "Roaming", "JavaDevTool");
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (e) {
    /* ignore */
  }
  return d;
}

function cfgFile(name) {
  return path.join(cfgDir(), name);
}

function readJson(f, def) {
  try {
    return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    return def;
  }
}

function writeJson(f, obj) {
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

const rootsFile = () => cfgFile("roots.json");
const recordFile = () => cfgFile("installed.json");

// ---------------------------------------------------------------- 安装位置
/**
 * 安装位置分三层：
 *
 *   rootOf(kind)      —— 当前生效的位置（用户选过的 > 默认）
 *   defaultRoot(kind) —— 从没选过时的位置：%LOCALAPPDATA%\JavaDevTool\runtimes\<kind>
 *   suggestRoot()     —— 从用户自己已有的 JDK / Node 反推「他习惯把版本放在哪」
 *
 * 为什么要有第三层：用户机器上 JDK 17 在 E:\develop\Java，默认给他装到 C 盘
 * 的隐藏目录里，等于把开发环境拆成两半——以后重装系统、迁移磁盘时只有一半
 * 找得到。所以点「安装」时先问一句：装到 E:\develop\Java 行不行？
 */
function defaultRoot(kind) {
  const k = kind === "jdk" ? "jdk" : "node";
  // 兼容 v4.0.x 的手工配置：%APPDATA%\JavaDevTool\runtimes.txt 第一行是基目录
  const legacy = (() => {
    try {
      const t = fs.readFileSync(cfgFile("runtimes.txt"), "utf8").split(/\r?\n/)[0].trim().replace(/^"|"$/g, "");
      if (t && path.isAbsolute(t)) return t;
    } catch (e) {
      /* ignore */
    }
    return "";
  })();
  if (legacy) return path.join(legacy, k);
  return path.join(localBase(), "JavaDevTool", "runtimes", k);
}

/** 当前生效的安装位置（只解析，不创建目录——扫描时可能遇到掉线的网络盘） */
function rootOf(kind) {
  const cfg = readJson(rootsFile(), {}) || {};
  const v = cfg[kind === "jdk" ? "jdk" : "node"];
  if (typeof v === "string" && v && path.isAbsolute(v)) return path.resolve(v);
  return path.resolve(defaultRoot(kind));
}

/** 实际写入用的根目录（会创建） */
function runtimeRoot(kind) {
  const d = rootOf(kind);
  try {
    fs.mkdirSync(d, { recursive: true });
  } catch (e) {
    /* ignore */
  }
  return d;
}

/** 记住安装位置。传空字符串 = 恢复默认。 */
function setRoot(kind, dir) {
  const k = kind === "jdk" ? "jdk" : "node";
  const cfg = readJson(rootsFile(), {}) || {};
  if (!dir) delete cfg[k];
  else cfg[k] = path.resolve(String(dir));
  return writeJson(rootsFile(), cfg);
}

/** 是否显式设置过（用于界面区分「用户选的」和「系统默认」） */
function rootIsCustom(kind) {
  const cfg = readJson(rootsFile(), {}) || {};
  return typeof cfg[kind === "jdk" ? "jdk" : "node"] === "string";
}

// ---------------------------------------------------------------- 安装记录
/**
 * 记录「哪些目录是 JunctionBox 装的」。
 * 只凭目录名猜是不行的：一旦用户把安装位置指到自己的 E:\develop\Java，
 * 那个目录里全是他自己的 JDK，误删一个就是灾难。所以：
 *   - 只有装过的目录才允许删除，且必须在本程序装完之后写进记录
 *   - v4.0.x 没有记录文件，默认目录（runtimes\<kind>）下的目录仍视为自己装的
 */
function recorded(kind) {
  const k = kind === "jdk" ? "jdk" : "node";
  const all = readJson(recordFile(), {}) || {};
  const arr = Array.isArray(all[k]) ? all[k] : [];
  return arr.filter((s) => typeof s === "string" && s);
}

function saveRecorded(kind, arr) {
  const k = kind === "jdk" ? "jdk" : "node";
  const all = readJson(recordFile(), {}) || {};
  all[k] = [...new Set(arr)];
  writeJson(recordFile(), all);
}

function record(kind, dir) {
  const p = path.resolve(String(dir));
  const arr = recorded(kind);
  if (arr.some((x) => x.toLowerCase() === p.toLowerCase())) return;
  arr.push(p);
  saveRecorded(kind, arr);
}

function unrecord(kind, dir) {
  const p = path.resolve(String(dir)).toLowerCase();
  saveRecorded(kind, recorded(kind).filter((x) => path.resolve(x).toLowerCase() !== p));
}

const inDir = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** 这个目录是否由本程序安装（决定「删除」按钮是否出现） */
function isManaged(kind, dir) {
  const p = path.resolve(String(dir || ""));
  if (!p) return false;
  if (path.basename(p).startsWith(".tmp_")) return false;
  if (recorded(kind).some((x) => path.resolve(x).toLowerCase() === p.toLowerCase())) return true;
  return inDir(p, defaultRoot(kind));
}

// ---------------------------------------------------------------- 位置推荐
const SKIP_PARENTS = new Set([
  "c:\\", "d:\\", "e:\\", "f:\\", "g:\\",
  "c:\\program files", "c:\\program files (x86)",
  "c:\\windows", "c:\\windows\\system32", "c:\\programdata",
]);

function writable(dir) {
  try {
    const probe = path.join(dir, ".jbox_probe_" + process.pid);
    fs.mkdirSync(probe);
    fs.rmdirSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 从「用户已有的运行时目录」反推安装位置。
 * JDK 的真实目录是 <X>\jdk17（里面有 bin\java.exe），所以候选 = 它的上级 <X>；
 * Node 同理。然后按命中数量排序，命中越多说明用户越是把版本堆在那一处。
 *
 * @param {"jdk"|"node"} kind
 * @param {string[]} dirs 已发现的运行时目录（真实路径）
 */
function suggestRoot(kind, dirs) {
  const own = rootOf(kind).toLowerCase();
  const groups = new Map();

  for (const raw of dirs || []) {
    if (!raw) continue;
    let p;
    try {
      p = path.resolve(raw);
    } catch (e) {
      continue;
    }
    const low = p.toLowerCase();
    // 本程序装的、以及藏在 AppData 里的，都不代表用户的使用习惯
    if (low === own || low.startsWith(own + "\\")) continue;
    if (/\\appdata\\/i.test(low)) continue;
    if (/\\javadevtool\\/i.test(low)) continue;

    const parent = path.dirname(p);
    const pl = parent.toLowerCase();
    if (SKIP_PARENTS.has(pl) || pl === low) continue;
    if (path.basename(p).startsWith(".tmp_")) continue;

    const g = groups.get(pl) || { root: parent, count: 0, names: [] };
    g.count++;
    if (g.names.length < 4) g.names.push(path.basename(p));
    groups.set(pl, g);
  }

  const list = [...groups.values()]
    .map((g) => ({
      ...g,
      depth: g.root.split(path.sep).length,
      writable: writable(g.root),
      isDefault: g.root.toLowerCase() === own,
    }))
    // 版本数多的优先；同样多时取更深的目录（E:\develop\Java 比 E:\develop 更准确）
    .sort((a, b) => b.count - a.count || b.depth - a.depth || a.root.localeCompare(b.root));

  const best = list.find((g) => g.writable) || list[0] || null;
  return {
    root: best ? best.root : "",
    count: best ? best.count : 0,
    names: best ? best.names : [],
    writable: best ? best.writable : false,
    candidates: list.slice(0, 5),
  };
}

/**
 * 校验一个安装位置。返回 { ok, err, path }。
 * 校验会顺手把目录建出来——反正紧接着就要往里写文件，
 * 提前建还能当场发现「没有写权限」而不是下载完 190MB 才失败。
 */
function checkRoot(kind, dir) {
  const raw = String(dir || "").trim().replace(/^"|"$/g, "");
  if (!raw) return { ok: false, err: "请选择安装位置" };
  if (!path.isAbsolute(raw)) return { ok: false, err: "请填写完整路径，例如 E:\\develop\\Java" };

  const p = path.resolve(raw);
  if (/^[a-z]:\\?$/i.test(p)) {
    return { ok: false, err: "不要直接装在盘符根目录，建议单独建一层，例如 E:\\develop\\Java" };
  }
  if (p.length > 180) return { ok: false, err: "路径太长，请换一个短一些的目录" };

  // 不能指向「自己就是一个 JDK / Node」的目录，否则会套出一层 zulu-25.0.1\zulu-25.0.1
  const probe = kind === "jdk" ? path.join(p, "bin", "java.exe") : path.join(p, "node.exe");
  if (fs.existsSync(probe)) {
    return {
      ok: false,
      err: `这个目录本身就是一个 ${kind === "jdk" ? "JDK" : "Node"}，请选它的上级目录`,
    };
  }

  try {
    fs.mkdirSync(p, { recursive: true });
  } catch (e) {
    return { ok: false, err: "无法创建目录：" + (e && e.message ? e.message : e) };
  }
  if (!writable(p)) {
    return { ok: false, err: "这个目录不可写（可能需要管理员权限），请换一个位置" };
  }
  return { ok: true, path: p };
}

/** 目标目录重名且不属于自己时，往后找一个空位，绝不覆盖用户的目录 */
function freeName(root, name) {
  let p = path.join(root, name);
  for (let i = 2; fs.existsSync(p) && i < 30; i++) p = path.join(root, `${name}-${i}`);
  return p;
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
 * @param {{root?:string}} [opts] 本次安装的目标根目录，缺省用已记住的位置
 */
async function install(kind, item, report, opts) {
  const ctx = createCtx(item.id, report);
  activeJobs.set(item.id, ctx);

  const root = path.resolve((opts && opts.root) || runtimeRoot(kind));
  const stamp = Date.now();
  const tmp = path.join(root, `.tmp_${item.id}_${stamp}`);
  const zip = path.join(os.tmpdir(), `jbox_${item.id}_${stamp}.zip`);

  try {
    fs.mkdirSync(root, { recursive: true });
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
    let finalPath = path.join(root, name);

    // 同版本重装：清掉自己上次装的；不属于自己的同名目录一律让位，不删
    if (fs.existsSync(finalPath)) {
      if (isManaged(kind, finalPath)) rmDir(finalPath);
      else finalPath = freeName(root, name);
    }
    fs.renameSync(inner, finalPath);
    if (fs.existsSync(tmp)) rmDir(tmp);

    record(kind, finalPath);
    ctx.report({ phase: "done", path: finalPath, name, source: srcIdx, root });
    return { ok: true, path: finalPath, name, root };
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

/**
 * 只删本程序装过的目录，且不能是联接。
 * 不再按「在安装根目录下」放行：用户完全可以把安装位置指到自己的
 * E:\develop\Java，那里全是他自己的 JDK，按路径放行就等于给他一把删除自己环境的刀。
 */
function uninstall(kind, dir) {
  const p = path.resolve(String(dir || ""));
  if (!isManaged(kind, p)) {
    return { ok: false, err: "该目录不是本程序安装的，为安全起见不会删除" };
  }
  let st;
  try {
    st = fs.lstatSync(p);
  } catch (e) {
    return { ok: false, err: "目录不存在" };
  }
  if (st.isSymbolicLink()) return { ok: false, err: "这是一个联接，已拒绝删除" };
  if (!rmDir(p)) return { ok: false, err: "删除失败，可能有进程正在使用（请先切换版本并关闭终端）" };
  unrecord(kind, p);
  return { ok: true };
}

/**
 * 清理上次异常退出留下的临时目录（进程被强杀时 finally 不会执行）。
 * 只删超过 1 小时的，避免误删正在进行的解压。
 */
function cleanStale(kind) {
  const root = rootOf(kind);
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
function installed(kind) {
  const root = rootOf(kind);
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
  rootOf,
  runtimeRoot,
  setRoot,
  rootIsCustom,
  defaultRoot,
  checkRoot,
  suggestRoot,
  isManaged,
  recorded,
  install,
  cancel,
  uninstall,
  installed,
  cleanStale,
  normJavaVersion,
  brandOf,
};
