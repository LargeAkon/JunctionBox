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
  store: { open: false, kind: "jdk", loading: false, jdk: [], node: [], roots: {} },
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

/**
 * 安装一个运行时。
 * 装完立刻切过去——用户点「安装」的意图就是「让我能用这个版本」，
 * 再让他回列表点一次切换是多余的一步。
 */
export async function installRuntime(item) {
  const id = item.id;
  if (S.dl[id] && ["download", "extract"].includes(S.dl[id].phase)) return;
  S.dl[id] = { phase: "download", pct: 0, got: 0, total: 0, speed: 0 };
  try {
    const r = await window.api.installRuntime(item.kind, id);
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
