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
    <div class="toolbar">
      <label class="field search">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg>
        <input v-model="kw" placeholder="端口 / 进程名 / PID" spellcheck="false" />
        <button v-if="kw" class="clr" title="清空" @click="kw = ''">
          <svg viewBox="0 0 10 10"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        </button>
      </label>

      <div class="seg">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ on: filter === 'java' }" @click="filter = 'java'">Java</button>
        <button :class="{ on: filter === 'sys' }" @click="filter = 'sys'">系统</button>
      </div>

      <button class="btn" :disabled="S.scanning" @click="refreshPorts()">
        <svg class="icon" viewBox="0 0 24 24" :class="{ spin: S.scanning }"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
        {{ S.scanning ? "扫描中" : "刷新" }}
      </button>

      <span class="grow"/>

      <span class="count"><b>{{ rows.length }}</b> / {{ S.ports.length }}</span>
      <button class="auto" :class="{ on: auto }" @click="auto = !auto">
        <span class="switch" :class="{ on: auto }"/>
        自动刷新
      </button>
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
          <p v-else-if="kw || filter !== 'all'">没有匹配的端口</p>
          <p v-else>没有监听中的端口</p>
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
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 12px;
}
.search {
  width: 248px;
}
.clr {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: var(--text-3);
}
.clr svg {
  width: 8px;
  height: 8px;
}
.clr:hover {
  background: var(--hover);
  color: var(--text);
}
.grow {
  flex: 1;
}
.count {
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.count b {
  color: var(--text-2);
  font-weight: 600;
}
.auto {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 4px 0 2px;
  font-size: 12px;
  color: var(--text-3);
  border-radius: var(--radius-sm);
}
.auto:hover {
  color: var(--text-2);
}
.auto.on {
  color: var(--text);
}
.auto .switch {
  width: 28px;
  height: 16px;
}
.auto .switch::after {
  width: 10px;
  height: 10px;
  margin-top: -5px;
  left: 2px;
}
.auto .switch.on::after {
  transform: translateX(12px);
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
  grid-template-columns: 62px minmax(110px, 178px) 96px 162px 66px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 10px;
  padding: 0 10px 0 16px;
}

.thead {
  height: 32px;
  flex: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-3);
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-sunken);
  padding-right: 22px;
  position: sticky;
  top: 0;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.r {
  text-align: right;
}

.tbody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
}

.row {
  height: 34px;
  font-size: 12.5px;
  color: var(--text-2);
  border-bottom: 1px solid var(--stroke);
  transition: background var(--dur-fast) var(--ease);
}
.row:last-child {
  border-bottom: none;
}
.row:hover {
  background: var(--hover);
}
.row.java {
  background: color-mix(in srgb, var(--accent) 3.2%, transparent);
}
.row.java:hover {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}
.row.sys {
  background: color-mix(in srgb, var(--danger) 2.6%, transparent);
}
.row.sys:hover {
  background: color-mix(in srgb, var(--danger) 6%, transparent);
}

.port {
  font-family: var(--font-mono);
  font-size: 12px;
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
  font-weight: 550;
}
.row.sys .name {
  color: var(--text-2);
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
  font-size: 11px;
  color: var(--text-3);
}
.pid {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}
.act {
  display: flex;
  justify-content: flex-end;
}
.killbtn {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-xs);
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.killbtn .icon {
  width: 11px;
  height: 11px;
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
  gap: 9px;
  height: 200px;
  color: var(--text-3);
  font-size: 12.5px;
}
.eicon {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
  stroke-linecap: round;
  opacity: 0.4;
}
</style>
