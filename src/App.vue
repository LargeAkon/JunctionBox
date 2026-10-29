<script setup>
import { computed, onMounted, ref } from "vue";
import { S, boot, refreshPorts, refreshEnv } from "./store.js";
import PortsView from "./views/PortsView.vue";
import JdkView from "./views/JdkView.vue";
import NodeView from "./views/NodeView.vue";
import AboutView from "./views/AboutView.vue";
import RuntimeStore from "./components/RuntimeStore.vue";

const navs = [
  { id: "ports", label: "端口检测" },
  { id: "jdk", label: "JDK 版本" },
  { id: "node", label: "Node 版本" },
  { id: "about", label: "关于" },
];

const views = { ports: PortsView, jdk: JdkView, node: NodeView, about: AboutView };
const current = computed(() => views[S.view] || PortsView);

const maximized = ref(false);
onMounted(() => {
  window.api?.onWinState((d) => (maximized.value = d.maximized));
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
        <span class="title">JunctionBox</span>
        <span class="ver">v{{ S.info?.version || "3.0.0" }}</span>
      </div>

      <div class="winctrl">
        <button class="wc" title="最小化" @click="minimize">
          <svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button class="wc" :title="maximized ? '还原' : '最大化'" @click="toggleMax">
          <svg v-if="!maximized" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1" /></svg>
          <svg v-else viewBox="0 0 10 10"><rect x="0.5" y="2.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1" /><path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" fill="none" stroke="currentColor" stroke-width="1" /></svg>
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
            <span class="ind"/>
            <svg v-if="it.id === 'ports'" class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>
            <svg v-else-if="it.id === 'jdk'" class="icon" viewBox="0 0 24 24"><path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/></svg>
            <svg v-else-if="it.id === 'node'" class="icon" viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M9 16v-5.5a1.5 1.5 0 0 1 3 0V16"/></svg>
            <svg v-else class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.01"/></svg>
            <span class="txt">{{ it.label }}</span>
          </button>
        </div>

        <div class="nav-foot">
          <button class="navitem sm" @click="reload">
            <span class="ind"/>
            <svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
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
      <span>JDK <b>{{ S.activeJdk.ver || "—" }}</b></span>
      <span class="sep"/>
      <span>Node <b>{{ S.activeNode.ver || "—" }}</b></span>
      <span class="sep"/>
      <span>端口 <b>{{ stat.t }}</b> · Java <b class="c-java">{{ stat.j }}</b> · 系统 <b class="c-sys">{{ stat.s }}</b></span>
      <span class="grow"/>
      <span class="muted">{{ timeText ? "上次扫描 " + timeText : "等待扫描" }}</span>
    </footer>

    <!-- ── 轻提示 ───────────────────────────────── -->
    <Transition name="toast">
      <div v-if="S.toast.text" :key="S.toast.id" class="toast" :class="S.toast.type">
        {{ S.toast.text }}
      </div>
    </Transition>

    <!-- ── 版本库（全局单例，由 JDK / Node 页唤起）── -->
    <RuntimeStore />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  animation: fade-in 220ms var(--ease-out);
}

/* ── 标题栏 ── */
.titlebar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  height: 44px;
  flex: none;
  padding-left: 14px;
  gap: 10px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
}
.logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(145deg, var(--accent), #2f83ff);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 1px 3px rgba(0, 90, 234, 0.32);
}
.mark {
  width: 13px;
  height: 13px;
}
.title {
  font-family: var(--font-display);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.1px;
  color: var(--text);
}
.ver {
  font-size: 11px;
  color: var(--text-3);
  padding-left: 2px;
}

.winctrl {
  -webkit-app-region: no-drag;
  display: flex;
  height: 100%;
}
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
  background: #c42b1c;
  color: #fff;
}

/* ── 主体 ── */
.main {
  flex: 1;
  display: flex;
  min-height: 0;
  padding: 0 12px 0 8px;
  gap: 4px;
}

.sidenav {
  width: 208px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 6px 0 8px;
  gap: 2px;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.navitem {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  height: 36px;
  padding: 0 12px 0 14px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 13px;
  text-align: left;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.navitem:hover {
  background: var(--hover);
  color: var(--text);
}
.navitem.on {
  background: var(--layer-2);
  color: var(--text);
  font-weight: 600;
}
.ind {
  position: absolute;
  left: 3px;
  top: 50%;
  width: 3px;
  height: 0;
  margin-top: 0;
  border-radius: 2px;
  background: var(--accent);
  transition: height var(--dur) var(--ease), margin-top var(--dur) var(--ease);
}
.navitem.on .ind {
  height: 16px;
  margin-top: -8px;
}
.navitem .icon {
  width: 17px;
  height: 17px;
  opacity: 0.86;
}
.navitem.on .icon {
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
  padding-top: 8px;
}
.navitem.sm {
  height: 32px;
  font-size: 12.5px;
}

.content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 页面绝对定位重叠，切换时不会挤占彼此的空间 */
.content :deep(.page) {
  position: absolute;
  inset: 0;
}

/* ── 状态栏 ── */
.statusbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 30px;
  padding: 0 16px 0 14px;
  font-size: 11.5px;
  color: var(--text-2);
  border-top: 1px solid var(--stroke);
  background: var(--layer-3);
}
.statusbar b {
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.statusbar b.c-java {
  color: var(--accent);
}
.statusbar b.c-sys {
  color: var(--danger);
}
.sep {
  width: 1px;
  height: 11px;
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
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--success) 22%, transparent);
}
.dot.live {
  background: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
  animation: pulse 1.1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* ── Toast ── */
.toast {
  position: fixed;
  left: 50%;
  bottom: 46px;
  transform: translateX(-50%);
  padding: 9px 18px;
  border-radius: var(--radius);
  background: var(--layer-hover);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  font-size: 12.5px;
  color: var(--text);
  backdrop-filter: blur(24px);
  z-index: 50;
}
.toast.ok {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
}
.toast.error {
  border-color: color-mix(in srgb, var(--danger) 50%, transparent);
  color: var(--danger);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
