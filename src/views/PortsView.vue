<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { S, refreshPorts, killProc } from "../store.js";
import ConfirmDialog from "../components/ConfirmDialog.vue";

const kw = ref("");
const filter = ref("all"); // all | java | sys
const auto = ref(false);
const picked = ref(null);

let timer = null;
function syncAuto() {
  clearInterval(timer);
  if (auto.value) timer = setInterval(() => refreshPorts(true), 3000);
}
watch(auto, syncAuto);
onBeforeUnmount(() => clearInterval(timer));

const rows = computed(() => {
  const k = kw.value.trim().toLowerCase();
  return S.ports.filter((r) => {
    if (filter.value === "java" && !r.java) return false;
    if (filter.value === "sys" && !r.sys) return false;
    if (!k) return true;
    return (
      String(r.port).includes(k) ||
      r.name.toLowerCase().includes(k) ||
      String(r.pid).includes(k)
    );
  });
});

function tagOf(r) {
  if (r.java) return "JAVA";
  if (r.sys) return "系统";
  return "";
}

function ask(r) {
  picked.value = r;
}

function doKill() {
  const r = picked.value;
  picked.value = null;
  if (r) killProc(r.pid, r.name);
}

onMounted(() => {
  if (!S.ports.length) refreshPorts();
});
</script>

<template>
  <section class="page">
    <header class="ph">
      <div>
        <h1>端口检测</h1>
        <p>双击行可结束进程。</p>
      </div>
      <div class="ph-act">
        <button class="btn" :disabled="S.scanning" @click="refreshPorts()">
          <svg class="icon" viewBox="0 0 24 24" :class="{ spin: S.scanning }"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
          {{ S.scanning ? "扫描中" : "刷新" }}
        </button>
      </div>
    </header>

    <div class="toolbar">
      <label class="field search">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
        <input v-model="kw" placeholder="搜索端口 / 进程名 / PID" spellcheck="false" />
        <button v-if="kw" class="clr" title="清空" @click="kw = ''">
          <svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </label>

      <div class="seg">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ on: filter === 'java' }" @click="filter = 'java'">Java</button>
        <button :class="{ on: filter === 'sys' }" @click="filter = 'sys'">系统</button>
      </div>

      <button class="auto" @click="auto = !auto">
        <span class="switch" :class="{ on: auto }"/>
        <span>自动刷新</span>
      </button>

      <span class="grow"/>
      <span class="count">显示 <b>{{ rows.length }}</b> / {{ S.ports.length }}</span>
    </div>

    <div class="card table">
      <div class="thead">
        <span>端口</span>
        <span>进程</span>
        <span>标识</span>
        <span>监听地址</span>
        <span class="r">PID</span>
        <span>命令行</span>
        <span/>
      </div>

      <div class="tbody">
        <div
          v-for="r in rows"
          :key="r.port + '_' + r.pid"
          class="row"
          :class="{ java: r.java, sys: r.sys }"
          @dblclick="ask(r)"
        >
          <span class="port">{{ r.port }}</span>
          <span class="name" :title="r.name">{{ r.name }}</span>
          <span class="tags">
            <em v-if="r.java" class="chip java">JAVA</em>
            <em v-else-if="r.sys" class="chip sys">系统</em>
            <em v-if="r.svc" class="chip">{{ r.svc }}</em>
          </span>
          <span class="addr">{{ r.ip }}:{{ r.port }}</span>
          <span class="pid r">{{ r.pid }}</span>
          <span class="cmd" :title="r.cmd">{{ r.cmd || "—" }}</span>
          <span class="act">
            <button class="killbtn" title="结束进程" @click.stop="ask(r)">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </span>
        </div>

        <div v-if="!rows.length" class="empty">
          <svg viewBox="0 0 24 24" class="eicon"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
          <p v-if="S.portErr">扫描失败：{{ S.portErr }}</p>
          <p v-else-if="S.scanning">正在扫描…</p>
          <p v-else>没有匹配的端口</p>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="!!picked"
      :title="picked && picked.sys ? '结束系统进程？' : '结束进程'"
      :danger="true"
      ok-text="结束进程"
      :message="picked ? `即将结束 ${picked.name}（PID ${picked.pid}），它正在监听端口 ${picked.port}。\n\n` + (picked.sys ? '这是 Windows 系统进程，强制结束可能导致系统不稳定。' : '该进程未保存的数据会丢失。') : ''"
      @close="picked = null"
      @ok="doKill"
    />
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px 4px 12px;
}

.ph {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 4px 14px;
}
h1 {
  font-family: var(--font-display);
  font-size: 25px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
}
.ph p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-2);
}
.ph-act {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 4px 12px;
}
.search {
  width: 250px;
}
.clr {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  color: var(--text-3);
}
.clr svg {
  width: 9px;
  height: 9px;
}
.clr:hover {
  background: var(--hover);
  color: var(--text);
}
.auto {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
}
.auto:hover {
  background: var(--hover);
}
.grow {
  flex: 1;
}
.count {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.count b {
  color: var(--text-2);
  font-weight: 600;
}

.card {
  background: var(--layer);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.thead,
.row {
  display: grid;
  grid-template-columns: 68px minmax(110px, 186px) 148px 168px 74px minmax(0, 1fr) 40px;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 14px;
}

.thead {
  height: 34px;
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-3);
  border-bottom: 1px solid var(--stroke);
  background: var(--layer-3);
  position: sticky;
  top: 0;
}
.r {
  text-align: right;
}

.tbody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.row {
  height: 36px;
  font-size: 12.5px;
  color: var(--text-2);
  border-bottom: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease);
}
.row:hover {
  background: var(--hover);
}
.row.java {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}
.row.java:hover {
  background: color-mix(in srgb, var(--accent) 9%, transparent);
}
.row.sys {
  background: color-mix(in srgb, var(--danger) 4%, transparent);
}
.row.sys:hover {
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.port {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}
.row.java .name {
  color: var(--accent);
  font-weight: 600;
}
.row.sys .name {
  color: var(--danger);
}
.tags {
  display: flex;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
}
.addr,
.cmd {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
}
.pid {
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.act {
  display: flex;
  justify-content: flex-end;
}
.killbtn {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.killbtn .icon {
  width: 12px;
  height: 12px;
}
.row:hover .killbtn {
  opacity: 1;
}
.killbtn:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 220px;
  color: var(--text-3);
  font-size: 12.5px;
}
.eicon {
  width: 26px;
  height: 26px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.5;
}
</style>
