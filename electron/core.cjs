"use strict";
/**
 * 业务逻辑层（Electron 主进程）
 * 端口扫描 / JDK 检测与切换 / Node 检测与切换
 *
 * ⚠️ 全异步设计：
 * Electron 的窗口消息循环跑在主进程里。以前这里用 spawnSync，切换环境变量时
 * 主进程会被完全堵住（PowerShell 的 SetEnvironmentVariable 要广播 WM_SETTINGCHANGE
 * 并等所有顶层窗口响应，机器上开的软件越多越久），于是窗口变「未响应」，
 * 点几下就被系统判死，表现成卡顿 + 闪退。
 * 现在一律用 execFile 回调式 API 包成 Promise，主进程只等不堵。
 */
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const installer = require("./installer.cjs");

// ---------------------------------------------------------------- 进程执行
/** 运行外部程序，异步返回 stdout / stderr / 退出码 */
function run(exe, args, timeout) {
  return new Promise((resolve) => {
    execFile(
      exe,
      args,
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        timeout: timeout || 15000,
      },
      (err, stdout, stderr) => {
        let code = 0;
        if (err) code = typeof err.code === "number" ? err.code : (err.killed ? 124 : -1);
        resolve({ out: (stdout || "").trim(), err: (stderr || "").trim(), code });
      }
    );
  });
}

// ---------------------------------------------------------------- PowerShell
/**
 * 编码说明（中文乱码的根因就在这里）：
 * Windows PowerShell 5.1 的 stdout 被重定向到管道时，用的是「系统 OEM 代码页」——
 * 中文系统是 CP936(GBK)，不是 UTF-8。直接 encoding:"utf8" 去解，
 * GBK 的双字节就被当成非法 UTF-8，每个字节塌成一个 U+FFFD。
 *
 * 解法：不让中文经过控制台编码。进程内先转成 UTF-8 字节，再 base64，
 * base64 是纯 ASCII，任何代码页都传得过去，Node 侧再 base64 → utf8 还原。
 */

/** PowerShell 单引号字符串转义 */
function psq(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

/**
 * 执行 PowerShell 表达式，按 UTF-8 无损取回结果。
 * 只适合单条表达式（返回值会被 [string] 化）。
 */
function psExpr(script, timeout) {
  const wrapped =
    "$ErrorActionPreference='SilentlyContinue';" +
    "$__v = " + script + ";" +
    "if ($null -eq $__v) { '' } else {" +
    " [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([string]$__v)) }";
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", wrapped],
      { encoding: "latin1", windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeout || 60000 },
      (_err, stdout) => {
        const b64 = String(stdout || "").replace(/[^A-Za-z0-9+/=]/g, "");
        if (!b64) return resolve("");
        try {
          resolve(Buffer.from(b64, "base64").toString("utf8").trim());
        } catch (e) {
          resolve("");
        }
      }
    );
  });
}

let __seq = 0;

/**
 * 执行 PowerShell 并把输出解析为 JSON（兼容单对象 / 数组 / 空）。
 * 走临时文件而不是 stdout：Set-Content -Encoding UTF8 由 PowerShell 自己写盘，
 * 完全不经过控制台代码页，中文进程名与命令行原样保留。
 */
function psJson(script, timeout) {
  const f = path.join(os.tmpdir(), `jdt_j_${process.pid}_${Date.now()}_${__seq++}.json`);
  // 管道必须接在同一行末尾，否则 PowerShell 会报「不能使用空管道元素」
  const full =
    "$ErrorActionPreference='SilentlyContinue';" +
    script.replace(/\s+$/, "") +
    " | ConvertTo-Json -Compress -Depth 6 | Set-Content -LiteralPath " + psq(f) + " -Encoding UTF8";
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", full],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeout || 60000 },
      () => {
        let rows = [];
        try {
          // PS 5.1 的 -Encoding UTF8 会带 BOM，JSON.parse 认不了，必须剥掉
          const t = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "").trim();
          if (t && t !== "null" && t !== "{}") {
            const v = JSON.parse(t);
            rows = Array.isArray(v) ? v : [v];
          }
        } catch (e) {
          rows = [];
        }
        try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
        resolve(rows);
      }
    );
  });
}

// ---------------------------------------------------------------- 端口扫描
const SYS_PROCS = new Set([
  "system", "system idle process", "registry", "memory compression",
  "smss", "csrss", "wininit", "winlogon", "services", "lsass", "lsaiso",
  "svchost", "dwm", "explorer", "conhost", "dllhost", "taskhostw",
  "fontdrvhost", "sihost", "audiodg", "spoolsv", "runtimebroker",
  "wmiprvse", "wudfhost", "ctfmon", "smartscreen", "searchapp",
  "searchindexer", "searchprotocolhost", "searchfilterhost",
  "startmenuexperiencehost", "shellexperiencehost", "applicationframehost",
  "textinputhost", "widgets", "msmpeng", "securityhealthservice",
  "securityhealthsystray", "vmmem", "wslservice",
]);

const SVC = {
  80: "HTTP", 443: "HTTPS", 8080: "Tomcat", 8081: "HTTP", 8443: "HTTPS",
  3306: "MySQL", 5432: "PostgreSQL", 1433: "SQL Server", 1521: "Oracle",
  6379: "Redis", 27017: "MongoDB", 9200: "Elasticsearch", 9300: "ES",
  8848: "Nacos", 9848: "Nacos", 5672: "RabbitMQ", 15672: "RabbitMQ",
  9092: "Kafka", 2181: "ZooKeeper", 8500: "Consul", 22: "SSH", 21: "FTP",
  3389: "远程桌面", 1099: "RMI", 5005: "Debug",
};

function isJavaProc(name, cmd) {
  const n = (name || "").toLowerCase();
  const c = (cmd || "").toLowerCase();
  return n.includes("java") || n.includes("jar") || n.includes("jdk") ||
         c.includes("java.exe") || c.includes("-jar ");
}

async function scanPorts() {
  // 进程表与 netstat 互不依赖，并行拉取
  const [rows, net] = await Promise.all([
    psJson("Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath,CommandLine", 30000),
    run("netstat", ["-ano"], 20000),
  ]);

  // 一次性拿到全部进程信息（PID → 名称 / 路径 / 命令行）
  const procMap = new Map();
  for (const p of rows) {
    if (!p || p.ProcessId == null) continue;
    procMap.set(Number(p.ProcessId), {
      name: p.Name || "",
      path: p.ExecutablePath || "",
      cmd: p.CommandLine || "",
    });
  }

  // netstat 解析监听端口：比 Get-NetTCPConnection 快一个数量级
  // 注意不能加 -p tcp，那样会把 IPv6(TCPv6) 监听过滤掉
  const listeners = [];
  for (const line of net.out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    if (parts[0].toUpperCase() !== "TCP") continue;
    if (parts[3].toUpperCase() !== "LISTENING") continue;
    const local = parts[1];
    const idx = local.lastIndexOf(":");
    if (idx < 0) continue;
    const ip = local.slice(0, idx).replace(/^\[|\]$/g, "");
    const port = parseInt(local.slice(idx + 1), 10);
    const pid = parseInt(parts[4], 10);
    if (!port || Number.isNaN(port)) continue;
    listeners.push({ ip, port, pid: Number.isNaN(pid) ? 0 : pid });
  }

  if (!listeners.length && !procMap.size) {
    return { ok: false, err: "无法读取端口列表（netstat 与进程表都没有返回数据）", rows: [] };
  }

  const seen = new Map();
  for (const r of listeners) {
    const key = r.port + "|" + r.pid;
    const pri = r.ip === "0.0.0.0" ? 3 : (r.ip.includes(":") ? 1 : 2);
    const prev = seen.get(key);
    if (prev && prev.pri >= pri) continue;
    const info = procMap.get(r.pid) || { name: "", cmd: "" };
    const rawName = info.name || "未知进程";
    const name = rawName.replace(/\.exe$/i, "");
    const lname = rawName.toLowerCase();
    seen.set(key, {
      pri, port: r.port, pid: r.pid, ip: r.ip,
      name, cmd: info.cmd || "",
      java: isJavaProc(rawName, info.cmd),
      sys: r.pid === 0 || r.pid === 4 ||
           SYS_PROCS.has(lname) || SYS_PROCS.has(name.toLowerCase()),
      svc: SVC[r.port] || "",
    });
  }

  const out = [...seen.values()];
  out.sort((a, b) =>
    (a.java ? 0 : a.sys ? 2 : 1) - (b.java ? 0 : b.sys ? 2 : 1) || a.port - b.port
  );
  return { ok: true, rows: out };
}

async function killProcess(pid) {
  const n = Number(pid);
  // 0/4 是 System Idle / System，结束它们只会失败并弹一堆系统错误；
  // 结束自己也毫无意义（窗口一关进程就没了，还会让「正在刷新」卡住）。
  if (!Number.isInteger(n) || n <= 4) return { ok: false, err: "这个 PID 不是可以结束的进程" };
  if (n === process.pid) return { ok: false, err: "不能结束程序自己的进程" };
  const r = await run("taskkill", ["/F", "/T", "/PID", String(n)], 20000);
  // 用退出码判定，不解析 taskkill 的本地化提示（中文系统下是 GBK，按 utf8 读会乱码）
  // taskkill 约定：0 成功，128 进程不存在，其余多为权限不足
  if (r.code === 0) return { ok: true, err: "" };
  if (r.code === 128) {
    return { ok: false, err: "进程 " + n + " 已经不存在了，可能已自行退出" };
  }
  return { ok: false, err: "结束进程 " + n + " 失败，可能权限不足" };
}

// ---------------------------------------------------------------- 配置持久化
function cfgDir() {
  const d = path.join(os.homedir(), "AppData", "Roaming", "JavaDevTool");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function loadManual(name) {
  const f = path.join(cfgDir(), name);
  if (!fs.existsSync(f)) return [];
  try {
    return fs.readFileSync(f, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (e) { return []; }
}
function saveManual(paths, name) {
  try {
    fs.writeFileSync(path.join(cfgDir(), name), [...new Set(paths)].sort().join("\r\n"), "utf8");
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- 版本联接（junction）
/**
 * 核心思路：环境变量只配置一次，之后切换版本完全不碰注册表。
 *
 *   JAVA_HOME = <links>\jdk       （目录联接 → 真实 JDK）
 *   Path 首项 = %JAVA_HOME%\bin   （本来就是变量，自动跟随，无需再改）
 *   Node Path = <links>\node      （目录联接 → 真实 Node）
 *
 * 切换 = 重建联接：纯文件系统操作，毫秒级、无广播、无注册表写入、不需要管理员。
 * 用 junction 而不是符号链接，因为 junction 不需要 SeCreateSymbolicLinkPrivilege，
 * 且支持跨卷（链接在 C 盘、JDK 在 E 盘也能用）。
 */
function linkRoot() {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const d = path.join(base, "JavaDevTool", "links");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
const jdkLink = () => path.join(linkRoot(), "jdk");
const nodeLink = () => path.join(linkRoot(), "node");

/** 是目录联接/符号链接？ */
function isLink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; }
}

/** 联接指向的真实目录；不是联接则返回 "" */
function linkTarget(p) {
  if (!p || !isLink(p)) return "";
  try { return path.normalize(fs.realpathSync(p)); } catch (e) { return ""; }
}

/**
 * 摘掉联接本身。
 * 必须用 rmdir（RemoveDirectory 语义）：只删链接，不会顺着删到真实目录。
 * 绝不能用 fs.rmSync({recursive:true}) —— 那会真的把 JDK 目录清空。
 */
function dropLink(p) {
  if (!isLink(p)) return true;
  try { fs.rmdirSync(p); return true; }
  catch (e) {
    try { fs.unlinkSync(p); return true; } catch (e2) { return false; }
  }
}

/**
 * 重建联接。
 *
 * 直接「先删旧的、再建新的」会留下一个空档：宽则几十毫秒里 links\jdk 不存在，
 * 恰好这段时间有进程启动 java，就会报「找不到 JRE」。虽然很少见，但切换本来
 * 就是高频操作，概率会累积。
 *
 * 改成：先把新联接建在 <link>.new，再删旧的、把 .new 移正。
 * 断开窗口从「一次建联接」压缩到「一次 rename」，而且 rename 是同一卷上的元数据操作。
 */
function makeLink(link, target) {
  try {
    const t = path.resolve(target);
    if (!fs.existsSync(t)) return false;

    // 已经指向目标：零操作，避免无谓地重建（也让「切换到当前版本」变成纯 no-op）
    const cur = linkTarget(link);
    if (cur && path.normalize(cur).toLowerCase() === path.normalize(t).toLowerCase()) return true;

    const stage = link + ".new";
    dropLink(stage);
    fs.symlinkSync(t, stage, "junction");
    if (!isLink(stage)) return false;

    if (dropLink(link)) {
      try {
        fs.renameSync(stage, link);
        if (isLink(link)) return true;
      } catch (e) {
        /* 极少数环境不允许 rename 联接，走下面的兜底 */
      }
    }
    dropLink(stage);
    dropLink(link);
    fs.symlinkSync(t, link, "junction");
    return isLink(link);
  } catch (e) {
    return false;
  }
}

/**
 * 自愈：环境变量已经指向联接，但联接不见了（被清理工具删掉、手工删除、父目录被清空）。
 * 这时 java/node 会直接"消失"，所以用上次选中的版本自动重建。
 *
 * ⚠️ 只在「环境变量里确实引用了这个联接」时才动手。
 * 早先 node 这一支是无条件重建的：只要用户切换过一次（留下 last_node.txt），
 * 下次启动就会在 %LOCALAPPDATA% 里凭空造一个 links\node。联接本身无害，
 * 但配合 healEnvPath 会把一个从未托管过 node 的用户静默切到旧版本上。
 */
function healLinks(env) {
  const eq = (a, b) => a && b && path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
  // PATH 里是否出现过某个目录（逐段比较，兼容带引号与 %VAR% 展开前后的写法）
  const mentions = (raw, target) => {
    const t = path.normalize(target).toLowerCase();
    return String(raw || "")
      .split(";")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .some((s) => {
        try {
          return path.normalize(expandEnv(s, {})).toLowerCase() === t;
        } catch (e) {
          return false;
        }
      });
  };

  const jl = jdkLink();
  if (eq(env.ju || env.jm, jl) && !isLink(jl)) {
    const last = loadManual("last_jdk.txt")[0];
    if (last && fs.existsSync(path.join(last, "bin", "java.exe"))) makeLink(jl, last);
  }

  const nl = nodeLink();
  if (!isLink(nl) && (mentions(env.pu, nl) || mentions(env.pm, nl))) {
    const last = loadManual("last_node.txt")[0];
    if (last && fs.existsSync(path.join(last, "node.exe"))) makeLink(nl, last);
  }
}

// ---------------------------------------------------------------- 环境变量（带缓存）
// 每次快照都开 4~11 个 PowerShell 是以前「很卡」的主因之一：
// 这里把 4 个变量合并成一次查询，并在本次切换/新增目录前复用结果。
let envCache = null;
let envPending = null;

async function loadEnv() {
  const rows = await psJson([
    "$o=[ordered]@{}",
    "$o.ju=[Environment]::GetEnvironmentVariable('JAVA_HOME','User')",
    "$o.jm=[Environment]::GetEnvironmentVariable('JAVA_HOME','Machine')",
    "$o.pu=[Environment]::GetEnvironmentVariable('Path','User')",
    "$o.pm=[Environment]::GetEnvironmentVariable('Path','Machine')",
    "$o",
  ].join("; "), 20000);
  const o = rows[0] || {};
  return {
    ju: o.ju || "",
    jm: o.jm || "",
    pu: o.pu || "",
    pm: o.pm || "",
  };
}

async function readEnv() {
  if (envCache) return envCache;
  if (!envPending) {
    envPending = loadEnv()
      .then((v) => { envCache = v; return v; })
      .catch(() => ({ ju: "", jm: "", pu: "", pm: "" }))
      .finally(() => { envPending = null; });
  }
  return envPending;
}

function invalidateEnv() {
  envCache = null;
}

/** 按 Windows 真实优先级返回 PATH 目录：机器级在前、用户级在后 */
async function pathDirs() {
  const e = await readEnv();
  // 用注册表里的最新 JAVA_HOME 展开，别用 process.env（那是进程启动时的快照）
  const vars = { JAVA_HOME: e.ju || e.jm || "" };
  const out = [];
  for (const raw of [e.pm, e.pu]) {
    for (const seg of String(raw || "").split(";")) {
      const s = seg.trim().replace(/^"|"$/g, "");
      if (!s) continue;
      out.push(path.normalize(expandEnv(s, vars)));
    }
  }
  return out;
}

async function getEnvVar(name, scope) {
  const e = await readEnv();
  if (name === "JAVA_HOME") return scope === "Machine" ? e.jm : e.ju;
  if (name === "Path") return scope === "Machine" ? e.pm : e.pu;
  return psExpr(`[Environment]::GetEnvironmentVariable(${psq(name)},${psq(scope)})`);
}

// ---------------------------------------------------------------- JDK
const JDK_ROOTS = [
  "C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium",
  "C:\\Program Files\\Eclipse Foundation", "C:\\Program Files\\Amazon Corretto",
  "C:\\Program Files\\Zulu", "C:\\Program Files\\Microsoft",
  "C:\\Program Files\\BellSoft", "C:\\Program Files\\Semeru",
  "C:\\Program Files\\JetBrains\\Runtime", "C:\\Program Files (x86)\\Java",
  "D:\\Program Files\\Java", "E:\\Program Files\\Java", "D:\\Java", "E:\\Java",
  "D:\\develop\\Java", "E:\\develop\\Java", "D:\\develop", "E:\\develop",
];

async function javaProbe(p) {
  const out = { ver: "", vendor: "" };
  try {
    // java -version 把版本写到 stderr，必须两个流都读
    const r = await run(path.join(p, "bin", "java.exe"), ["-version"], 10000);
    const t = r.err + "\n" + r.out;
    const m = t.match(/version "([^"]+)"/);
    if (m) out.ver = m[1];
    const low = t.toLowerCase();
    const table = [
      ["zulu", "Azul Zulu"], ["temurin", "Eclipse Temurin"], ["adoptopenjdk", "AdoptOpenJDK"],
      ["corretto", "Amazon Corretto"], ["semeru", "IBM Semeru"], ["openj9", "IBM Semeru"],
      ["graalvm", "GraalVM"], ["microsoft", "Microsoft"], ["oracle", "Oracle"],
    ];
    for (const [k, v] of table) if (low.includes(k)) { out.vendor = v; break; }
  } catch (e) { /* ignore */ }
  return out;
}

/** release 里的 IMPLEMENTOR 写法不统一（"Azul Systems, Inc." / "Azul Zulu"），统一成产品名 */
function normImpl(s) {
  const t = String(s || "").toLowerCase();
  if (!t) return "";
  if (t.includes("azul")) return "Azul Zulu";
  if (t.includes("adoptium") || t.includes("temurin")) return "Eclipse Temurin";
  if (t.includes("amazon") || t.includes("corretto")) return "Amazon Corretto";
  if (t.includes("microsoft")) return "Microsoft";
  if (t.includes("bellsoft") || t.includes("liberica")) return "BellSoft Liberica";
  if (t.includes("oracle")) return "Oracle";
  return s;
}

async function jdkInfo(p) {
  let ver = "", impl = "", arch = "";
  try {
    const t = fs.readFileSync(path.join(p, "release"), "utf8");
    let m = t.match(/JAVA_VERSION="([^"]*)"/); if (m) ver = m[1];
    m = t.match(/IMPLEMENTOR="([^"]*)"/); if (m) impl = normImpl(m[1]);
    m = t.match(/OS_ARCH="([^"]*)"/); if (m) arch = m[1];
  } catch (e) { /* ignore */ }

  // 老 JDK（如 Zulu 1.7）release 信息不全，用 java -version 兜底
  if (!ver || (!impl && ver.startsWith("1.") && !ver.includes("_"))) {
    const probe = await javaProbe(p);
    if (probe.ver) ver = probe.ver;
    if (!impl && probe.vendor) impl = probe.vendor;
  }
  if (!ver) ver = path.basename(p);
  return { ver, impl, arch, jdk: fs.existsSync(path.join(p, "bin", "javac.exe")) };
}

function vkey(v) {
  let s = String(v || "");
  if (s.startsWith("1.")) s = s.slice(2);
  return (s.match(/\d+/g) || []).slice(0, 4).map(Number);
}

/** 返回 [{path, ver, impl, arch, jdk}]，按版本从高到低 */
async function findJdks() {
  const cands = [], seen = new Set();
  const add = (p) => {
    if (!p) return;
    p = path.normalize(p);
    // 正在解压的临时目录不参与列表，否则下载到一半就会冒出一个残缺 JDK
    if (path.basename(p).startsWith(".tmp_")) return;
    // 如果是联接，换成它指向的真实目录：避免「current」被当成一个独立版本，
    // 也保证重复扫描时不会同时列出链接与目标两份
    const lt = linkTarget(p);
    if (lt) { add(lt); return; }
    const k = p.toLowerCase();
    if (seen.has(k)) return;
    if (!fs.existsSync(path.join(p, "bin", "java.exe"))) return;
    seen.add(k);
    cands.push(p);
  };

  const roots = [...JDK_ROOTS, installer.rootOf("jdk"), ...loadManual("paths.txt")];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    add(root);
    try {
      for (const n of fs.readdirSync(root)) add(path.join(root, n));
    } catch (e) { /* ignore */ }
  }

  // 当前联接指向的目录，可能不在上面任何扫描范围内（装在了别的盘），补进来
  const curLink = linkTarget(jdkLink());
  if (curLink) add(curLink);

  // IDEA 自带 JDK
  const idea = path.join(os.homedir(), ".jdks");
  if (fs.existsSync(idea)) {
    try { for (const n of fs.readdirSync(idea)) add(path.join(idea, n)); } catch (e) {}
  }

  // 从 PATH 反查
  for (const seg of await pathDirs()) {
    if (seg.toLowerCase().endsWith("\\bin") && fs.existsSync(path.join(seg, "java.exe"))) {
      add(path.dirname(seg));
    }
  }

  const rows = await Promise.all(cands.map(async (p) => ({ path: p, ...(await jdkInfo(p)) })));
  rows.sort((a, b) => {
    const ka = vkey(a.ver), kb = vkey(b.ver);
    for (let i = 0; i < 4; i++) if ((ka[i] || 0) !== (kb[i] || 0)) return (kb[i] || 0) - (ka[i] || 0);
    return 0;
  });
  return rows;
}

async function activeJdk() {
  const e = await readEnv();
  const home = e.ju || e.jm;
  // JAVA_HOME 可能就是联接（<links>\jdk），要解析出真实目录才能和版本列表对上
  const real = home ? (linkTarget(home) || home) : "";
  if (real && fs.existsSync(path.join(real, "bin", "java.exe"))) {
    const i = await jdkInfo(real);
    return { ver: i.ver, path: real, home };
  }
  for (const d of await pathDirs()) {
    const rd = linkTarget(d) || d;
    if (fs.existsSync(path.join(rd, "java.exe"))) {
      const root = rd.toLowerCase().endsWith("\\bin") ? path.dirname(rd) : rd;
      const probe = await javaProbe(root);
      const ver = probe.ver || (await jdkInfo(root)).ver;
      return { ver, path: root, home };
    }
  }
  return { ver: "", path: "", home };
}

// ---------------------------------------------------------------- 版本切换
/**
 * 为什么不再用 [Environment]::SetEnvironmentVariable：
 * 它每写一个变量都会向所有顶层窗口广播 WM_SETTINGCHANGE，并同步等待响应
 * （内部是 SendMessageTimeout，上限 5000ms）。JDK 切换要写 2~4 个变量，
 * 机器上挂起的窗口一多，每写一次都等满 5 秒，累积就是 10~20 秒。
 * 这正是「切换 JDK 要等十几二十秒」的根源。
 *
 * 现在改成：直接写注册表（毫秒级），广播交给独立后台进程发一次，切换本身完全不等。
 */

/** 展开 %VAR%，优先用刚从注册表读到的最新值（process.env 是启动时的快照，会过期） */
function expandEnv(s, extra) {
  return String(s || "").replace(/%([^%]+)%/g, (m, n) => {
    const k = n.toUpperCase();
    if (extra && extra[k] != null) return extra[k];
    const v = process.env[n];
    return v != null ? v : m;
  });
}

/** 网络路径一律不做存在性检查，避免 SMB 超时把切换拖死 */
const isUnc = (p) => /^\\\\/.test(String(p || ""));

/**
 * 写注册表里的环境变量。不做广播，耗时只在 PowerShell 启动上（约 400ms）。
 * 为什么不用 reg.exe：安全软件经常把它列入程序黑名单，被拦就切不动了。
 * 为什么不用 [Environment]::SetEnvironmentVariable：那个每写一次都要广播并同步等待（见上）。
 * 路径一律走 base64 传入，彻底避开中文与引号转义问题。
 */
const REG_MACHINE_PATH = "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const b64 = (s) => Buffer.from(String(s), "utf8").toString("base64");

async function writeEnv(userOps, machineOps) {
  // 先检查长度：写坏了比写不进去难查得多
  for (const op of [...userOps, ...machineOps]) {
    if (op.name !== "Path" || op.value === null) continue;
    const bad = checkPathSize(op.value);
    if (bad) return { ok: false, out: bad };
  }
  const lines = [
    "$ErrorActionPreference='Stop'",
    "function D([string]$b){ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) }",
    "try{",
    "  $u=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment',$true)",
    "  if(-not $u){ throw 'cannot open HKCU Environment' }",
  ];
  for (const op of userOps) {
    if (op.value === null) lines.push(`  try{ $u.DeleteValue('${op.name}',$false) }catch{}`);
    else lines.push(`  $u.SetValue('${op.name}',(D '${b64(op.value)}'),[Microsoft.Win32.RegistryValueKind]::${op.kind})`);
  }
  lines.push("  $u.Close()");
  if (machineOps.length) {
    lines.push("  try{");
    lines.push(`    $m=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey('${REG_MACHINE_PATH}',$true)`);
    lines.push("    if($m){");
    for (const op of machineOps) {
      if (op.value === null) lines.push(`      try{ $m.DeleteValue('${op.name}',$false) }catch{}`);
      else lines.push(`      $m.SetValue('${op.name}',(D '${b64(op.value)}'),[Microsoft.Win32.RegistryValueKind]::${op.kind})`);
    }
    lines.push("      $m.Close()");
    lines.push("    }");
    lines.push("  }catch{}"); // 非管理员写不动机器级，静默跳过
  }
  lines.push("  Write-Output 'OK'");
  lines.push("}catch{ Write-Output ('ERR:'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$_.Exception.Message))) }");

  const f = path.join(os.tmpdir(), `jdt_env_${Date.now()}.ps1`);
  // 必须带 UTF-16LE BOM，否则会按 ANSI 读取，中文与 $ 全变乱码
  fs.writeFileSync(f, "\uFEFF" + lines.join("\r\n"), "utf16le");
  try {
    const r = await run(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", f],
      30000
    );
    const t = (r.out || r.err || "").trim();
    if (/OK/.test(t)) return { ok: true, out: "" };
    const m = t.match(/ERR:([A-Za-z0-9+/=]+)/);
    if (m) {
      try { return { ok: false, out: Buffer.from(m[1], "base64").toString("utf8") }; } catch (e) {}
    }
    return { ok: false, out: t || "写入环境变量失败" };
  } finally {
    try { fs.unlinkSync(f); } catch (e) { /* ignore */ }
  }
}

/**
 * 通知 explorer「环境变量变了」，否则新开的终端还是老环境。
 * 用独立后台进程发送：它慢（最多 2 秒）也不影响切换结果，用户完全无感。
 *
 * 双保险：优先 P/Invoke 直接发 WM_SETTINGCHANGE（精确、2 秒超时）；
 * 万一 Add-Type 被安全策略拦住（部分企业环境会禁运行时编译），
 * 退化为对 JAVA_HOME 写一次同值——那个 API 自带广播，且 JAVA_HOME 本来就是
 * REG_SZ，不会破坏 Path 的 REG_EXPAND_SZ 类型。
 */
function broadcastEnv() {
  // 用 setx 发广播，而不是 Add-Type 调 SendMessageTimeout：
  // setx 是系统自带、带签名的工具，写值时内部就会广播 WM_SETTINGCHANGE，
  // 不会像 Add-Type（动态编译 C#）那样被安全软件拦掉——拦了就等于没广播，
  // 表现就是「注册表已经改了，但新开的终端还是老环境」。
  // 写完的临时变量立即删掉，不污染用户环境。
  const cmd = [
    "$k='JDT_ENV_REFRESH'",
    "try{ & \"$env:WINDIR\\system32\\setx.exe\" $k '1' | Out-Null }catch{}",
    "Start-Sleep -Milliseconds 300",
    "try{ [Environment]::SetEnvironmentVariable($k,$null,'User') }catch{}",
  ].join(";");
  try {
    const c = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", cmd],
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    c.unref();
  } catch (e) { /* 广播失败不影响切换本身 */ }
}

/** 重建 JDK 用的 PATH：去掉所有 JDK 的 bin，把 %JAVA_HOME%\bin 放到首位
 *
 * 细节：
 *  - 字面量 `%JAVA_HOME%\bin` 一律先剔除再统一放到首位。否则 JAVA_HOME 为空时
 *    expandEnv 会把它展开成 `\bin`，既匹配不上 homeBin 也匹配不上 `\bin$` 的盘查，
 *    结果就是同一项在 PATH 里出现两次。
 *  - 去重按小写比较，PATH 里重复项多了会把环境块撑爆（Windows 上限 32767 字符）。
 */
function rebuildJdkPath(curPath, oldHome, withPrefix) {
  const vars = { JAVA_HOME: oldHome || "" };
  const homeBin = oldHome ? oldHome.replace(/\\+$/, "") + "\\bin" : "";
  const keep = [];
  const seen = new Set();
  const push = (v) => {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    keep.push(v.trim());
  };
  for (const raw of String(curPath || "").split(";")) {
    const g = raw.trim();
    if (!g) continue;
    // 字面量 %JAVA_HOME%\bin 由这里统一处理：用户级会重新加到首位，
    // 机器级（withPrefix=false）则直接丢弃——机器级 JAVA_HOME 马上要被删掉，
    // 留着它只会变成一个展开不了的死项。
    if (/^%JAVA_HOME%\\bin\\?$/i.test(g)) continue;
    const exp = expandEnv(g, vars).replace(/\\+$/, "");
    if (homeBin && exp.toLowerCase() === homeBin.toLowerCase()) continue;
    if (/javapath/i.test(exp)) continue;
    // 只有形如 xxx\bin 的目录才落盘确认，别对每个 PATH 项都碰磁盘
    if (/\\bin$/i.test(exp) && !isUnc(exp) && fs.existsSync(path.join(exp, "java.exe"))) continue;
    push(g);
  }
  return withPrefix ? ["%JAVA_HOME%\\bin", ...keep].join(";") : keep.join(";");
}

/** 重建 Node 用的 PATH：去掉其它 node 目录，target 为空时只做清理 */
function rebuildNodePath(curPath, target) {
  const t = String(target || "").replace(/\\+$/, "");
  const keep = [];
  const seen = new Set();
  const push = (v) => {
    const k = v.trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    keep.push(v.trim());
  };
  for (const raw of String(curPath || "").split(";")) {
    const g = raw.trim();
    if (!g) continue;
    const exp = expandEnv(g, {}).replace(/\\+$/, "");
    if (t && exp.toLowerCase() === t.toLowerCase()) continue;
    // 路径里带 node 才值得查盘，其他项直接保留（旧 node 目录留在后面也无害）
    if (/node/i.test(exp) && !isUnc(exp) &&
        fs.existsSync(path.join(exp, "node.exe")) &&
        fs.existsSync(path.join(exp, "npm.cmd"))) continue;
    push(g);
  }
  return t ? [target, ...keep].join(";") : keep.join(";");
}

/**
 * 写 PATH 前的最后一道闸：Windows 单个环境变量上限 32767 字符，
 * 超了以后整块环境会被截断，表现为「有些程序突然找不到」。
 * 与其写坏，不如明确报错让人先清理 PATH。
 */
const PATH_LIMIT = 30000;
function checkPathSize(v) {
  const s = String(v || "");
  if (s.length <= PATH_LIMIT) return null;
  return `PATH 已经有 ${s.length} 个字符，超过 Windows 上限（${PATH_LIMIT}），` +
    "请先清理环境变量里用不到的目录再切换";
}

async function switchJdk(jdk) {
  if (!fs.existsSync(path.join(jdk, "bin", "java.exe"))) {
    return { ok: false, out: "该目录下没有 bin\\java.exe，不是有效的 JDK" };
  }
  saveManual([jdk], "last_jdk.txt"); // 供 healLinks 在联接被误删时恢复
  const link = jdkLink();

  // ---- 首选：只换联接，不碰注册表 ----
  if (makeLink(link, jdk)) {
    const e = await readEnv();
    const home = e.ju || "";
    const same = home && path.normalize(home).toLowerCase() === path.normalize(link).toLowerCase();

    // 已经指向联接 = 真正的零写入；否则只是首次迁移，写一次之后永远不再写
    if (same) return { ok: true, out: "", mode: "link", migrated: false };

    const newPath = rebuildJdkPath(e.pu, home || jdk, true);
    const machineOps = [];
    if (e.jm) machineOps.push({ name: "JAVA_HOME", value: null });
    const mp = e.pm ? rebuildJdkPath(e.pm, home || jdk, false) : "";
    if (e.pm && mp !== e.pm) machineOps.push({ name: "Path", value: mp, kind: "ExpandString" });

    const r = await writeEnv(
      [
        { name: "JAVA_HOME", value: link, kind: "String" },
        { name: "Path", value: newPath, kind: "ExpandString" },
      ],
      machineOps
    );
    if (!r.ok) return r;

    envCache = { ju: link, jm: "", pu: newPath, pm: mp && mp !== e.pm ? mp : e.pm };
    broadcastEnv();
    return { ok: true, out: "", mode: "link", migrated: true };
  }

  // ---- 兜底：文件系统不支持联接（FAT32 / 网络盘 / 被安全软件拦），退回注册表直写 ----
  const e = await readEnv();
  const oldHome = e.ju || e.jm || "";
  const newPath = rebuildJdkPath(e.pu, oldHome, true);

  // 机器级残留只有管理员能改，改不动就算了：用户级优先级更高，不影响结果
  const machineOps = [];
  if (e.jm) machineOps.push({ name: "JAVA_HOME", value: null });
  const mp = e.pm ? rebuildJdkPath(e.pm, oldHome, false) : "";
  if (e.pm && mp !== e.pm) machineOps.push({ name: "Path", value: mp, kind: "ExpandString" });

  const r = await writeEnv(
    [
      { name: "JAVA_HOME", value: jdk, kind: "String" },
      { name: "Path", value: newPath, kind: "ExpandString" },
    ],
    machineOps
  );
  if (!r.ok) return r;

  envCache = {
    ju: jdk,
    jm: e.jm ? "" : e.jm,
    pu: newPath,
    pm: mp && mp !== e.pm ? mp : e.pm,
  };
  broadcastEnv();
  return { ok: true, out: "", mode: "registry", migrated: false };
}

async function switchNode(nd) {
  if (!fs.existsSync(path.join(nd, "node.exe"))) {
    return { ok: false, out: "该目录下没有 node.exe，不是有效的 Node" };
  }
  saveManual([nd], "last_node.txt"); // 供 healLinks 恢复
  const link = nodeLink();

  // ---- 首选：只换联接，不碰注册表 ----
  if (makeLink(link, nd)) {
    const e = await readEnv();
    const hasLink = String(e.pu || "")
      .split(";")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .some((s) => path.normalize(expandEnv(s, {})).toLowerCase() === path.normalize(link).toLowerCase());

    // Path 里已经含这个联接 → 零写入，只改了联接指向
    if (hasLink) return { ok: true, out: "", mode: "link", migrated: false };

    const newPath = rebuildNodePath(e.pu, link);
    const machineOps = [];
    const mp = e.pm ? rebuildNodePath(e.pm, "") : "";
    if (e.pm && mp !== e.pm) machineOps.push({ name: "Path", value: mp, kind: "ExpandString" });

    const r = await writeEnv([{ name: "Path", value: newPath, kind: "ExpandString" }], machineOps);
    if (!r.ok) return r;

    envCache = { ju: e.ju, jm: e.jm, pu: newPath, pm: mp && mp !== e.pm ? mp : e.pm };
    broadcastEnv();
    return { ok: true, out: "", mode: "link", migrated: true };
  }

  // ---- 兜底：文件系统不支持联接，退回注册表直写 ----
  const e = await readEnv();
  const newPath = rebuildNodePath(e.pu, nd);

  const machineOps = [];
  const mp = e.pm ? rebuildNodePath(e.pm, "") : "";
  if (e.pm && mp !== e.pm) machineOps.push({ name: "Path", value: mp, kind: "ExpandString" });

  const r = await writeEnv([{ name: "Path", value: newPath, kind: "ExpandString" }], machineOps);
  if (!r.ok) return r;

  envCache = {
    ju: e.ju,
    jm: e.jm,
    pu: newPath,
    pm: mp && mp !== e.pm ? mp : e.pm,
  };
  broadcastEnv();
  return { ok: true, out: "", mode: "registry", migrated: false };
}

// ---------------------------------------------------------------- Node
const NODE_ROOTS = [
  "C:\\Program Files\\nodejs", "C:\\Program Files (x86)\\nodejs",
  "D:\\Program Files\\nodejs", "E:\\Program Files\\nodejs",
  "D:\\nodejs", "E:\\nodejs", "D:\\node", "E:\\node",
  "D:\\develop\\node", "E:\\develop\\node",
  "D:\\develop\\nodejs", "E:\\develop\\nodejs",
  "C:\\nvm4w\\nodejs", "D:\\nvm4w\\nodejs", "E:\\nvm4w\\nodejs",
];

async function nodeMeta(p) {
  const exe = path.join(p, "node.exe");
  if (!fs.existsSync(exe)) return { ver: "", arch: "" };
  let ver = "", arch = "";
  try {
    const r = await run(exe, ["-p", "process.version+'|'+process.arch"], 10000);
    const t = (r.out + "\n" + r.err).trim();
    const m = t.match(/v(\d+\.\d+\.\d+)\s*\|\s*(\w+)/);
    if (m) { ver = m[1]; arch = m[2]; }
    else { const m2 = t.match(/v(\d+\.\d+\.\d+)/); if (m2) ver = m2[1]; }
  } catch (e) { /* ignore */ }
  if (!ver) {
    const m = p.match(/[\\/]v?(\d+\.\d+\.\d+)$/);
    if (m) ver = m[1];
  }
  return { ver, arch };
}

function npmVersion(p) {
  for (const rel of ["node_modules\\npm\\package.json", "lib\\node_modules\\npm\\package.json"]) {
    const f = path.join(p, rel);
    if (fs.existsSync(f)) {
      try { return JSON.parse(fs.readFileSync(f, "utf8")).version || ""; } catch (e) { return ""; }
    }
  }
  return "";
}

/** 返回 [{path, ver, arch, npm}]，按版本从高到低 */
async function findNodes() {
  const cands = [], seen = new Set();
  const add = (p) => {
    if (!p) return;
    p = path.normalize(p);
    // 联接换成真实目录，避免列出重复项
    const lt = linkTarget(p);
    if (lt) { add(lt); return; }
    const k = p.toLowerCase();
    if (seen.has(k)) return;
    if (!fs.existsSync(path.join(p, "node.exe"))) return;
    seen.add(k);
    cands.push(p);
  };
  const scanParent = (root) => {
    add(root);
    for (const sub of ["versions", "nodejs"]) {
      const d = path.join(root, sub);
      if (!fs.existsSync(d)) continue;
      try { for (const n of fs.readdirSync(d)) add(path.join(d, n)); } catch (e) {}
    }
  };

  for (const r of [...NODE_ROOTS, ...loadManual("node_paths.txt")]) scanParent(r);

  // 版本库的安装位置（可能是用户自己的 E:\develop\node 之类），子目录直接就是版本
  const nRoot = installer.rootOf("node");
  scanParent(nRoot);
  try {
    for (const n of fs.readdirSync(nRoot)) {
      if (!n.startsWith(".tmp_")) add(path.join(nRoot, n));
    }
  } catch (e) {
    /* ignore */
  }
  for (const env of ["NVM_HOME", "NVM_SYMLINK", "VOLTA_HOME"]) {
    const d = process.env[env];
    if (d) scanParent(d);
  }
  for (const base of [
    path.join(os.homedir(), "AppData", "Roaming", "nvm"),
    path.join(os.homedir(), "AppData", "Local", "Volta", "tools", "image", "node"),
  ]) if (fs.existsSync(base)) scanParent(base);

  for (const seg of await pathDirs()) if (fs.existsSync(path.join(seg, "node.exe"))) add(seg);

  // 当前联接的目标可能不在任何扫描范围内，补进来
  const curNLink = linkTarget(nodeLink());
  if (curNLink) add(curNLink);

  const rows = await Promise.all(cands.map(async (p) => {
    const m = await nodeMeta(p);
    return { path: p, ver: m.ver, arch: m.arch, npm: npmVersion(p) };
  }));
  rows.sort((a, b) => {
    const ka = vkey(a.ver), kb = vkey(b.ver);
    for (let i = 0; i < 3; i++) if ((ka[i] || 0) !== (kb[i] || 0)) return (kb[i] || 0) - (ka[i] || 0);
    return 0;
  });
  return rows;
}

async function activeNode() {
  for (const d of await pathDirs()) {
    // Path 里可能是联接（<links>\node），解析成真实目录才能对上版本列表
    const rd = linkTarget(d) || d;
    if (fs.existsSync(path.join(rd, "node.exe"))) {
      return { ver: (await nodeMeta(rd)).ver, path: rd, home: d };
    }
  }
  const ns = await findNodes();
  if (ns.length) return { ver: ns[0].ver, path: ns[0].path, home: "" };
  return { ver: "", path: "", home: "" };
}

// ---------------------------------------------------------------- 汇总
/**
 * 环境自检：Path / JAVA_HOME 被外部改坏、或指向已删除的旧版本目录时自动修回来。
 * 只在「确实找不到任何可用的 node / java」时动手，不覆盖用户自己的配置。
 * 这是「npm 突然找不到」这类问题的兜底——打开软件即自愈，不用等下次切换。
 *
 * ⚠️ 必须同时看**机器级**和用户级：
 * 旧实现只扫用户级 PATH。node 用官方安装包装在 C:\Program Files\nodejs 时，
 * 那条在机器级 PATH 里，用户级当然是空的 —— 于是被判成「没有 node」，
 * 然后把这个程序自己的 links\node 插到用户级 PATH 首位。用户级优先级高于机器级，
 * 结果就是「我只是打开了这个工具，node 版本却被换了」。
 */
async function healEnvPath() {
  const e = await readEnv();
  const segs = String(e.pu || "").split(";").map((s) => s.trim()).filter(Boolean);
  const exp = (s) => path.normalize(expandEnv(s, {})).replace(/\\+$/, "");
  const has = (dir, file) => {
    if (!dir) return false;
    try {
      return fs.existsSync(path.join(dir, file));
    } catch (err) {
      return false;
    }
  };
  const segHas = (raw, file) =>
    String(raw || "")
      .split(";")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .some((s) => has(exp(s), file));

  const hasNode = segHas(e.pu, "node.exe") || segHas(e.pm, "node.exe");
  const hasJava =
    has(e.ju, "bin\\java.exe") || has(e.jm, "bin\\java.exe");

  // 只有用户真在本程序里切过一次，才认为它有授权去修自己的环境
  const adoptedNode = !!loadManual("last_node.txt")[0];
  const adoptedJdk = !!loadManual("last_jdk.txt")[0];

  const jl = jdkLink();
  const nl = nodeLink();
  const jLinkOk = has(jl, "bin\\java.exe");
  const nLinkOk = has(nl, "node.exe");

  const userOps = [];
  let nextSegs = segs.slice();
  if (!hasNode && nLinkOk && adoptedNode) {
    // 顺带清掉已经失效的 node 项（目录不存在、名字里带 node），否则每修一次就多一条垃圾
    const alive = segs.filter((s) => {
      const p = exp(s);
      if (fs.existsSync(p)) return true;
      if (isUnc(p)) return true; // 网络盘可能存在但当前不可达，不判死
      return !/node/i.test(p);
    });
    nextSegs = [nl, ...alive];
    userOps.push({ name: "Path", value: nextSegs.join(";"), kind: "ExpandString" });
  }
  if (!hasJava && jLinkOk && adoptedJdk) {
    userOps.push({ name: "JAVA_HOME", value: jl, kind: "String" });
  }
  if (!userOps.length) return false;

  const r = await writeEnv(userOps, []);
  if (r.ok) {
    envCache = { ...e, ju: hasJava ? e.ju : jl, pu: nextSegs.join(";") };
    broadcastEnv();
  }
  return r.ok;
}

async function snapshot() {
  const e = await readEnv();
  // 联接被误删时按上次的选择自动重建，否则 java / node 会凭空消失
  healLinks(e);
  // 环境变量被改坏（指向已删除的旧目录）时修回来
  await healEnvPath();
  const e2 = await readEnv();
  const [jdks, nodes, aj, an] = await Promise.all([
    findJdks(), findNodes(), activeJdk(), activeNode(),
  ]);
  return {
    jdks,
    activeJdk: aj,
    javaHome: e2.ju || "",
    nodes,
    activeNode: an,
    // 安装位置：界面据此显示「装到哪」，只有本程序装过的目录才允许删除（由主进程判定）
    runtimeRoots: { jdk: installer.rootOf("jdk"), node: installer.rootOf("node") },
  };
}

module.exports = {
  scanPorts, killProcess, loadManual, saveManual,
  findJdks, jdkInfo, activeJdk, switchJdk,
  findNodes, nodeMeta, npmVersion, activeNode, switchNode,
  snapshot, psExpr, invalidateEnv,
  jdkLink, nodeLink, isLink, linkTarget, dropLink, makeLink,
  // 纯函数，导出来给 scripts/selftest.cjs 做回归
  rebuildJdkPath, rebuildNodePath, checkPathSize,
};
