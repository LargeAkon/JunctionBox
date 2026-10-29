import { reactive } from "vue";

export const S = reactive({
  view: "ports",
  booted: false,
  dark: false,
  mica: false,
  info: null,

  ports: [],
  portErr: "",
  scanning: false,
  lastScan: 0,

  jdks: [],
  activeJdk: { ver: "", path: "" },
  javaHome: "",

  nodes: [],
  activeNode: { ver: "", path: "" },

  busy: "",
  toast: { text: "", type: "info", id: 0 },

  // 版本库（内置清单 + 按需下载）
  store: {
    open: false,
    kind: "jdk",
    loading: false,
    jdk: [],
    node: [],
    roots: {},
    customRoot: {},
    defaultRoot: {},
    // 安装选址对话框：null = 关闭
    ask: null,
  },
  // 安装进度：id -> { phase, pct, got, total, speed, error, source }
  dl: {},
});

// 便于调试与自动化验收：把响应式状态挂到 window（不影响 contextIsolation）
if (typeof window !== "undefined") window.__JDT = S;

let toastTimer = null;
export function toast(text, type = "info") {
  S.toast = { text, type, id: Date.now() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (S.toast = { ...S.toast, text: "" }), 2600);
}

export async function boot() {
  if (!window.api) {
    toast("预加载桥未注入，请通过桌面程序启动", "error");
    return;
  }
  const info = await window.api.info();
  S.info = info;
  S.dark = info.dark;
  S.mica = info.mica;
  document.documentElement.classList.toggle("mica", info.mica);
  document.documentElement.classList.toggle("dark", info.dark);

  window.api.onTheme(({ dark }) => {
    S.dark = dark;
    document.documentElement.classList.toggle("dark", dark);
  });

  window.api.onProgress?.((p) => {
    if (!p || !p.id) return;
    S.dl[p.id] = { ...(S.dl[p.id] || {}), ...p };
    if (p.phase === "done") {
      // 兜底清理：正常路径由 installRuntime 在刷新列表后主动删除
      setTimeout(() => {
        if (S.dl[p.id]?.phase === "done") delete S.dl[p.id];
      }, 2500);
    }
  });

  await Promise.all([refreshPorts(true), refreshEnv()]);
  S.booted = true;
}

export async function refreshPorts(silent = false) {
  if (S.scanning) return;
  S.scanning = true;
  if (!silent) S.portErr = "";
  try {
    const r = await window.api.scanPorts();
    if (r.ok) {
      S.ports = r.rows;
      S.portErr = "";
      S.lastScan = Date.now();
    } else {
      S.portErr = r.err || "扫描失败";
    }
  } catch (e) {
    S.portErr = String(e && e.message ? e.message : e);
  } finally {
    S.scanning = false;
  }
}

/**
 * 环境快照。内部做去重：连点刷新 / 切页同时触发时只跑一次，
 * 避免几份探测并发排队把界面拖慢。
 */
let envPending = null;
export function refreshEnv() {
  if (envPending) return envPending;
  envPending = (async () => {
    try {
      const r = await window.api.snapshot();
      S.jdks = r.jdks || [];
      S.activeJdk = r.activeJdk || { ver: "", path: "" };
      S.javaHome = r.javaHome || "";
      S.nodes = r.nodes || [];
      S.activeNode = r.activeNode || { ver: "", path: "" };
    } catch (e) {
      toast("读取环境失败：" + (e && e.message ? e.message : e), "error");
    }
    envPending = null;
  })();
  return envPending;
}

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

/**
 * 切换版本。
 * 关键点：注册表写完之后立刻把界面置为「当前」，再后台重新校准。
 * 以前是等 snapshot() 把 3 个 JDK + 2 个 Node 全部探测一遍才更新界面，
 * 用户看到的就是「点完半天没反应」。
 */
export async function switchJdk(path) {
  if (S.busy) return;
  S.busy = "jdk";
  try {
    const r = await window.api.switchJdk(path);
    if (!r.ok) {
      toast("切换失败：" + (r.out || "未知错误"), "error");
      return;
    }
    const hit = S.jdks.find((x) => same(x.path, path));
    // JAVA_HOME 现在固定指向目录联接，切换不会改写它；用真实路径去覆盖反而会显示错
    S.activeJdk = { ver: hit ? hit.ver : S.activeJdk.ver, path, home: S.javaHome };
    // 首次迁移会改写环境变量，必须重开终端才读得到；之后切换只换联接指向，老终端也立即生效
    toast(
      r.migrated
        ? "已切换到 Java " + (S.activeJdk.ver || "") + "，环境变量已更新，请重开终端"
        : "已切换到 Java " + (S.activeJdk.ver || ""),
      "ok"
    );
    refreshEnv(); // 后台校准，不阻塞界面
  } catch (e) {
    toast("切换失败：" + (e && e.message ? e.message : e), "error");
  } finally {
    S.busy = "";
  }
}

export async function switchNode(path) {
  if (S.busy) return;
  S.busy = "node";
  try {
    const r = await window.api.switchNode(path);
    if (!r.ok) {
      toast("切换失败：" + (r.out || "未知错误"), "error");
      return;
    }
    const hit = S.nodes.find((x) => same(x.path, path));
    S.activeNode = { ver: hit ? hit.ver : S.activeNode.ver, path, home: S.activeNode.home };
    toast(
      r.migrated
        ? "已切换到 Node " + (S.activeNode.ver || "") + "，环境变量已更新，请重开终端"
        : "已切换到 Node " + (S.activeNode.ver || ""),
      "ok"
    );
    refreshEnv(); // 后台校准，不阻塞界面
  } catch (e) {
    toast("切换失败：" + (e && e.message ? e.message : e), "error");
  } finally {
    S.busy = "";
  }
}

export async function addPath(kind) {
  const dir = await window.api.pickDir(kind);
  if (!dir) return;
  const r = await window.api.addPath(kind, dir);
  if (!r.ok) {
    toast(r.err || "添加失败", "error");
    return;
  }
  await refreshEnv();
  toast("已添加目录", "ok");
}

export async function killProc(pid, name) {
  const r = await window.api.kill(pid);
  if (r.ok) {
    toast(`已结束 ${name}（PID ${pid}）`, "ok");
    await refreshPorts(true);
  } else {
    toast("结束失败：" + (r.err || ""), "error");
  }
}

// ---------------------------------------------------------------- 版本库
const errText = (e) => String((e && e.message) || e || "");

/** 拉取内置清单 + 本机已装情况（按大版本匹配，避免重复下载同主版本） */
export async function loadStore() {
  if (!window.api?.storeList) return;
  S.store.loading = true;
  try {
    const r = await window.api.storeList();
    S.store.jdk = r.jdk || [];
    S.store.node = r.node || [];
    S.store.roots = r.roots || {};
    S.store.customRoot = r.customRoot || {};
    S.store.defaultRoot = r.defaultRoot || {};
  } catch (e) {
    toast("读取版本库失败：" + errText(e), "error");
  } finally {
    S.store.loading = false;
  }
}

export function openStore(kind) {
  S.store.kind = kind === "node" ? "node" : "jdk";
  S.store.open = true;
  loadStore();
}

export function closeStore() {
  S.store.open = false;
}

// ---------------------------------------------------------------- 安装选址
/**
 * 点「安装」不等于「直接装到 C 盘」。
 * 先问：装到你现在放 JDK/Node 的那个目录行不行？
 *  - 有建议（用户已有同类版本）→ 默认选中「和现有版本放在一起」，一次点击即可
 *  - 没有建议 → 不预填路径，逼用户先想清楚装到哪，而不是默默塞进 C 盘
 */
export async function askInstall(item) {
  const kind = item.kind;
  // 先把对话框弹出来（探测要跑一次版本扫描，1 秒左右，别让用户以为点了没反应）
  S.store.ask = {
    open: true,
    pending: true,
    kind,
    id: item.id,
    label: item.label,
    suggested: {},
    defaultRoot: "",
    current: "",
    custom: "",
    mode: "custom",
    remember: true,
    err: "",
  };

  let plan = null;
  try {
    plan = await window.api.storePlan(kind);
  } catch (e) {
    plan = null;
  }

  const a = S.store.ask;
  if (!a || a.id !== item.id) return; // 探测期间被关掉了
  a.pending = false;
  if (!plan) {
    a.err = "读取安装位置失败，请手动选择目录";
    return;
  }

  const sug = plan.suggested || {};
  const remembered = plan.custom ? plan.root : "";
  a.suggested = sug;
  a.defaultRoot = plan.defaultRoot || plan.root || "";
  a.current = plan.root || "";
  a.custom = remembered || "";
  // 有建议就默认选中建议；没有建议就留空让用户自己定，绝不默认塞 C 盘
  a.mode = sug.root ? "suggested" : "custom";
}

export function closeAsk() {
  S.store.ask = null;
}

/** 对话框里最终会用到的路径 */
export function askRoot() {
  const a = S.store.ask;
  if (!a) return "";
  if (a.mode === "suggested") return a.suggested?.root || "";
  return String(a.custom || "").trim();
}

export function setAskMode(mode) {
  const a = S.store.ask;
  if (!a) return;
  a.mode = mode;
  a.err = "";
}

/** 弹目录选择框；选完自动切到「自定义」 */
export async function pickAskRoot() {
  const a = S.store.ask;
  if (!a) return;
  const r = await window.api.pickStoreRoot(a.kind, askRoot() || a.current || a.defaultRoot);
  if (!r?.ok) return;
  a.custom = r.path;
  a.mode = "custom";
  a.err = "";
}

export function useDefaultRoot() {
  const a = S.store.ask;
  if (!a) return;
  a.custom = a.defaultRoot;
  a.mode = "custom";
  a.err = "";
}

/** 确认安装：把位置一起带过去，勾了「以后都装到这里」才写进配置 */
export async function confirmAsk() {
  const a = S.store.ask;
  if (!a) return;
  const root = askRoot();
  if (!root) {
    a.err = "请先选择安装位置";
    return;
  }
  const payload = { kind: a.kind, id: a.id, label: a.label };
  const remember = a.remember;
  S.store.ask = null;
  await installRuntime(payload, root, remember);
}

/** 版本库底部的「更改…」：改默认安装位置 */
export async function changeStoreRoot(kind, current) {
  const r = await window.api.pickStoreRoot(kind, current || S.store.roots[kind] || "");
  if (!r?.ok) return;
  const s = await window.api.setStoreRoot(kind, r.path);
  if (!s.ok) {
    toast(s.err || "设置失败", "error");
    return;
  }
  await loadStore();
  toast("安装位置已更新", "ok");
}

/** 恢复默认位置（%LOCALAPPDATA%\JavaDevTool\runtimes） */
export async function resetStoreRoot(kind) {
  const s = await window.api.setStoreRoot(kind, "");
  if (!s.ok) {
    toast(s.err || "设置失败", "error");
    return;
  }
  await loadStore();
  toast("已恢复默认安装位置", "ok");
}

/**
 * 安装一个运行时。
 * 装完立刻切过去——用户点「安装」的意图就是「让我能用这个版本」，
 * 再让他回列表点一次切换是多余的一步。
 */
export async function installRuntime(item, root = "", remember = false) {
  const id = item.id;
  if (S.dl[id] && ["download", "extract"].includes(S.dl[id].phase)) return;
  S.dl[id] = { phase: "download", pct: 0, got: 0, total: 0, speed: 0 };
  try {
    const r = await window.api.installRuntime(item.kind, id, root, remember);
    if (!r.ok) {
      if (r.cancelled) {
        delete S.dl[id];
        toast("已取消安装", "info");
        return;
      }
      S.dl[id] = { ...(S.dl[id] || {}), phase: "error", error: r.err };
      toast("安装失败：" + (r.err || "未知错误"), "error");
      return;
    }
    await refreshEnv();
    await loadStore();
    delete S.dl[id];
    // 装到用户自己的目录里时，提示一下具体落点，避免以后找不到
    if (r.root && item.kind && S.store.customRoot?.[item.kind]) {
      toast("已安装到 " + r.path, "ok");
    }
    if (item.kind === "jdk") await switchJdk(r.path);
    else await switchNode(r.path);
  } catch (e) {
    delete S.dl[id];
    toast("安装失败：" + errText(e), "error");
  }
}

export async function cancelInstall(id) {
  try {
    await window.api.cancelInstall(id);
  } catch (e) {
    /* ignore */
  }
}

export async function removeRuntime(item) {
  const r = await window.api.removeRuntime(item.kind, item.installedPath);
  if (!r.ok) {
    toast(r.err || "删除失败", "error");
    return;
  }
  await refreshEnv();
  await loadStore();
  toast("已删除 " + item.label, "ok");
}
