<script setup>
import { computed, onMounted, ref } from "vue";
import { S, boot, refreshPorts, refreshEnv, toggleTheme } from "./store.js";
import PortsView from "./views/PortsView.vue";
import JdkView from "./views/JdkView.vue";
import NodeView from "./views/NodeView.vue";
import AboutView from "./views/AboutView.vue";
import RuntimeStore from "./components/RuntimeStore.vue";

const navs = [
  { id: "ports", label: "端口检测" },
  { id: "jdk", label: "Java" },
  { id: "node", label: "Node" },
  { id: "about", label: "关于" },
];

const views = { ports: PortsView, jdk: JdkView, node: NodeView, about: AboutView };
const current = computed(() => views[S.view] || PortsView);

const maximized = ref(false);
onMounted(async () => {
  window.api?.onWinState((d) => (maximized.value = d.maximized));
  // ready-to-show 时发的那条会早于这里的监听，主动拉一次真实状态
  try {
    const st = await window.api?.getWinState?.();
    if (st) maximized.value = !!st.maximized;
  } catch (e) {
    /* ignore */
  }
  boot();
});

const minimize = () => window.api?.minimize();
const toggleMax = () => window.api?.toggleMax();
const close = () => window.api?.close();

const stat = computed(() => {
  const t = S.ports.length;
  const j = S.ports.filter((r) => r.java).length;
  const s = S.ports.filter((r) => r.sys).length;
  return { t, j, s };
});

const timeText = computed(() => {
  if (!S.lastScan) return "";
  const d = new Date(S.lastScan);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
});

function reload() {
  refreshPorts();
  refreshEnv();
}
</script>

<template>
  <div class="shell">
    <!-- ── 自绘标题栏 ───────────────────────────── -->
    <header class="titlebar" @dblclick="toggleMax">
      <div class="brand">
        <div class="logo">
          <svg viewBox="0 0 16 16" class="mark"><path d="M7.2 1.6v7.1a1.9 1.9 0 0 1-1.9 1.9 1.9 1.9 0 0 1-1.9-1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11.3 1.4h2.4v6.6a2.3 2.3 0 0 1-4.6 0v-.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 14.2h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>
        </div>
        <span class="name">JunctionBox</span>
        <span class="ver">v{{ S.info?.version || "4.2.2" }}</span>
      </div>

      <div class="tright">
        <button
          class="tbtn"
          :title="S.dark ? '切换到浅色模式' : '切换到夜间模式'"
          :aria-label="S.dark ? '切换到浅色模式' : '切换到夜间模式'"
          @click="toggleTheme"
        >
          <svg v-if="!S.dark" class="ticon" viewBox="0 0 24 24">
            <path d="M20.5 14.4A8.6 8.6 0 0 1 9.6 3.5a8.6 8.6 0 1 0 10.9 10.9z" />
          </svg>
          <svg v-else class="ticon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
          </svg>
        </button>
        <span class="tdiv" />

        <button class="wc" title="最小化" @click="minimize">
          <svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button class="wc" :title="maximized ? '还原' : '最大化'" @click="toggleMax">
          <svg v-if="!maximized" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.4" fill="none" stroke="currentColor" stroke-width="1" /></svg>
          <svg v-else viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="7" height="7" rx="1.4" fill="none" stroke="currentColor" stroke-width="1" /><path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" fill="none" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button class="wc close" title="关闭" @click="close">
          <svg viewBox="0 0 10 10"><path d="M0.6 0.6l8.8 8.8M9.4 0.6L0.6 9.4" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" /></svg>
        </button>
      </div>
    </header>

    <!-- ── 主体 ─────────────────────────────────── -->
    <div class="main">
      <nav class="sidenav">
        <div class="nav-group">
          <button
            v-for="it in navs"
            :key="it.id"
            class="navitem"
            :class="{ on: S.view === it.id }"
            @click="S.view = it.id"
          >
            <svg v-if="it.id === 'ports'" class="nicon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>
            <svg v-else-if="it.id === 'jdk'" class="nicon" viewBox="0 0 24 24"><path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/></svg>
            <svg v-else-if="it.id === 'node'" class="nicon" viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M9 16v-5.5a1.5 1.5 0 0 1 3 0V16"/></svg>
            <svg v-else class="nicon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/></svg>
            <span class="txt">{{ it.label }}</span>
          </button>
        </div>

        <div class="nav-foot">
          <button class="navitem sm" @click="reload">
            <svg class="nicon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
            <span class="txt">全部重载</span>
          </button>
        </div>
      </nav>

      <main class="content">
        <component :is="current" :key="S.view" />
      </main>
    </div>

    <!-- ── 状态栏 ───────────────────────────────── -->
    <footer class="statusbar">
      <span class="pi"><i class="dot" :class="{ live: S.scanning }"/></span>
      <span>Java <b>{{ S.activeJdk.ver || "—" }}</b></span>
      <span class="sep"/>
      <span>Node <b>{{ S.activeNode.ver || "—" }}</b></span>
      <span class="sep"/>
      <span>端口 <b>{{ stat.t }}</b><span class="dim"> · Java </span><b class="c-java">{{ stat.j }}</b><span class="dim"> · 系统 </span><b class="c-sys">{{ stat.s }}</b></span>
      <span class="grow"/>
      <span class="muted">{{ timeText ? "上次扫描 " + timeText : "等待扫描" }}</span>
    </footer>

    <!-- ── 轻提示 ───────────────────────────────── -->
    <Transition name="toast">
      <div v-if="S.toast.text" :key="S.toast.id" class="toast" :class="S.toast.type" role="status" aria-live="polite">
        {{ S.toast.text }}
      </div>
    </Transition>

    <!-- ── 版本库（全局单例，由 Java / Node 页唤起）── -->
    <RuntimeStore />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
  animation: fade-in 160ms var(--ease-out);
}

/* ── 标题栏 ── */
.titlebar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  height: 46px;
  flex: none;
  padding-left: 16px;
  border-bottom: 1px solid var(--stroke);
  background: var(--bg);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #0056d6;
  color: #fff;
  display: grid;
  place-items: center;
  flex: none;
}
.mark {
  width: 13px;
  height: 13px;
}
.name {
  font-family: var(--font-display);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: var(--text);
}
.ver {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-3);
  padding: 1px 6px;
  border-radius: 20px;
  background: var(--bg-sunken);
  font-variant-numeric: tabular-nums;
}

.tright {
  -webkit-app-region: no-drag;
  display: flex;
  align-items: center;
  height: 100%;
}
.tbtn {
  width: 34px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  margin-right: 6px;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.tbtn:hover {
  background: var(--hover);
  color: var(--text);
}
.tbtn:active {
  background: var(--pressed);
}
.ticon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  animation: ticon-in 260ms var(--ease-out);
}
@keyframes ticon-in {
  from { transform: rotate(-40deg) scale(0.7); opacity: 0.4; }
  to { transform: none; opacity: 1; }
}
.tdiv {
  width: 1px;
  height: 16px;
  background: var(--stroke);
  margin-right: 4px;
}

/* 窗口按钮：贴边、无圆角、关闭键悬浮变红 */
.wc {
  width: 46px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.wc svg {
  width: 10px;
  height: 10px;
  overflow: visible;
}
.wc:hover {
  background: var(--hover);
  color: var(--text);
}
.wc:active {
  background: var(--pressed);
}
.wc.close:hover {
  background: #d02b20;
  color: #fff;
}

/* ── 主体 ── */
.main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.sidenav {
  width: 212px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 12px 10px;
  background: var(--bg-sub);
  border-right: 1px solid var(--stroke);
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.navitem {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  color: var(--text-2);
  font-size: 14px;
  text-align: left;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease);
}
.navitem:hover {
  background: var(--hover);
  color: var(--text);
}
.navitem.on {
  background: var(--layer);
  border-color: var(--stroke-strong);
  color: var(--text);
  font-weight: 550;
  box-shadow: var(--shadow-sm);
}
.nicon {
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.8;
}
.navitem.on .nicon {
  color: var(--accent);
  opacity: 1;
}
.txt {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-foot {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--stroke);
}
.navitem.sm {
  height: 34px;
  font-size: 12.5px;
  color: var(--text-3);
}

.content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--bg);
}

/* 页面绝对定位重叠，切换时不会挤占彼此的空间；
   留白统一由这里给，各页面自己不再加 padding */
.content :deep(.page) {
  position: absolute;
  inset: 18px 20px 14px;
}

/* ── 状态栏 ── */
.statusbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 28px;
  padding: 0 18px;
  font-size: 11.5px;
  color: var(--text-3);
  border-top: 1px solid var(--stroke);
  background: var(--bg);
}
.statusbar b {
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.statusbar b.c-java {
  color: var(--accent);
}
.statusbar b.c-sys {
  color: var(--danger);
}
.dim {
  color: var(--text-3);
  opacity: 0.65;
}
.sep {
  width: 1px;
  height: 10px;
  background: var(--stroke-strong);
}
.grow {
  flex: 1;
}
.muted {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.pi {
  display: grid;
  place-items: center;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}
.dot.live {
  background: var(--accent);
  animation: pulse 1.1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Toast ── */
.toast {
  position: fixed;
  left: 50%;
  bottom: 44px;
  transform: translateX(-50%);
  padding: 8px 14px;
  border-radius: var(--radius);
  background: var(--layer);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  font-size: 12.5px;
  color: var(--text);
  z-index: 50;
  max-width: 70vw;
}
.toast.ok {
  border-color: color-mix(in srgb, var(--success) 40%, transparent);
}
.toast.error {
  border-color: var(--danger-stroke);
  color: var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
