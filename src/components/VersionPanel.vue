<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  family: { type: String, default: "" },
  currentVer: String,
  currentPath: String,
  noteLabel: String,
  noteValue: String,
  items: { type: Array, default: () => [] },
  busy: Boolean,
  emptyText: { type: String, default: "未检测到已安装的版本" },
});
const emit = defineEmits(["refresh", "add", "switch", "store"]);

const sel = ref("");

const activeKey = computed(() => (props.currentPath || "").toLowerCase());
const isActive = (it) => it.path.toLowerCase() === activeKey.value;
const selItem = computed(() => props.items.find((it) => it.path === sel.value));

function click(it) {
  sel.value = it.path;
}
function dbl(it) {
  sel.value = it.path;
  if (!isActive(it)) emit("switch", it.path);
}
function doSwitch() {
  if (selItem.value && !isActive(selItem.value)) emit("switch", selItem.value.path);
}
</script>

<template>
  <section class="page">
    <header class="ph">
      <div class="ph-act">
        <button class="btn primary-soft" @click="emit('store')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M4 8h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z"/><path d="M4 8V6.5A1.5 1.5 0 0 1 5.5 5H9l1.5 3"/></svg>
          版本库
        </button>
        <button class="btn" @click="emit('add')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          添加目录
        </button>
        <button class="btn ghost icon-only" title="重新检测" @click="emit('refresh')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
        </button>
      </div>
    </header>

    <!-- 当前生效：一条与版本行同尺度的摘要条，不再单独做大卡 -->
    <div class="cur">
      <span class="cur-tag">当前生效</span>
      <b class="cur-ver" :class="{ none: !currentVer }">{{ currentVer || "未检测到" }}</b>
      <span class="cur-path selectable" :title="currentPath">{{ currentPath || "PATH 中未找到可执行文件" }}</span>
      <span v-if="noteValue" class="cur-note">
        <span class="nl">{{ noteLabel }}</span>
        <b class="selectable" :title="noteValue">{{ noteValue }}</b>
      </span>
    </div>

    <!-- 只有 0~1 个版本时的引导 -->
    <div v-if="items.length <= 1" class="guide">
      <svg class="gicon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
      <div class="gtext">
        <b>{{ items.length ? "只有一个 " + family + " 版本" : "未检测到 " + family }}</b>
        <span>从版本库再装一个，就能一键切换。</span>
      </div>
      <button class="btn sm" @click="emit('store')">打开版本库</button>
    </div>

    <!-- 列表头 -->
    <div class="listhead">
      <span>已安装 <b>{{ items.length }}</b> 个版本</span>
      <span class="grow"/>
      <button
        class="btn primary sm"
        :disabled="!selItem || isActive(selItem) || busy"
        @click="doSwitch"
      >
        {{ busy ? "切换中…" : "切换到所选版本" }}
      </button>
    </div>

    <div class="vlist">
      <div
        v-for="it in items"
        :key="it.path"
        class="vrow"
        :class="{ act: isActive(it), sel: sel === it.path }"
        @click="click(it)"
        @dblclick="dbl(it)"
      >
        <span class="bar"/>
        <b class="vver">{{ it.ver }}</b>
        <span class="vtag">
          <span v-if="it.impl" class="vven">{{ it.impl }}</span>
          <em v-if="it.arch" class="chip">{{ it.arch }}</em>
        </span>
        <span class="vpath selectable" :title="it.path">{{ it.path }}</span>
        <span class="vmeta">
          <em v-if="isActive(it)" class="chip ok">当前使用</em>
          <em v-else-if="sel === it.path" class="chip accent">已选择</em>
        </span>
        <button class="vgo" :disabled="isActive(it)" title="切换到这个版本" @click.stop="dbl(it)">
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>

      <div v-if="!items.length" class="vempty">{{ emptyText }}</div>
    </div>
  </section>
</template>

<style scoped>
.icon-only {
  width: 30px;
  padding: 0;
  color: var(--text-2);
}

/* 当前生效摘要条：与版本行同高、同一套栅格语言，靠沉底色区分层级 */
.cur {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 46px;
  padding: 0 16px;
  margin-bottom: 10px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--bg-sunken);
}
.cur-tag {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--text-3);
}
.cur-ver {
  flex: none;
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cur-ver.none {
  color: var(--text-3);
  font-weight: 500;
}
.cur-path {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cur-note {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  overflow: hidden;
}
.cur-note .nl {
  flex: none;
  font-size: 10.5px;
  color: var(--text-3);
}
.cur-note b {
  font-family: var(--font-mono);
  font-weight: 500;
  font-size: 11px;
  color: var(--text-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 单版本引导条 */
.guide {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--accent-stroke);
  background: var(--accent-soft);
}
.gicon {
  flex: none;
  width: 17px;
  height: 17px;
  stroke: var(--accent);
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.gtext {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.gtext b {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.gtext span {
  font-size: 11.5px;
  color: var(--text-2);
}

.listhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 9px;
  font-size: 11.5px;
  color: var(--text-3);
}
.listhead > .btn {
  min-width: 112px;
}
.listhead b {
  color: var(--text-2);
  font-weight: 600;
}
.grow {
  flex: 1;
}

.vlist {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 4px;
}

.vrow {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 46px;
  padding: 0 14px 0 16px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--layer);
  overflow: hidden;
  transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.vrow:hover {
  background: var(--layer-hover);
  border-color: var(--stroke-strong);
}
.vrow.sel {
  border-color: var(--accent);
}
.vrow.act {
  border-color: var(--ink);
  background: var(--layer);
  box-shadow: var(--shadow-sm);
}

.bar {
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 0;
  background: var(--ink);
  border-radius: 0 2px 2px 0;
  transform: translateY(-50%);
  transition: height var(--dur) var(--ease);
}
.vrow.act .bar {
  height: 22px;
}

/* 单行栅格：版本号 / 厂商与架构 / 路径 / 徽章 / 操作，全部固定站位 */
.vver {
  flex: none;
  width: 104px;
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vtag {
  flex: none;
  width: 182px;
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
}
.vven {
  flex: none;
  width: 114px;
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vpath {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vmeta {
  flex: none;
  width: 84px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.vgo {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  display: grid;
  place-items: center;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}
.vrow:hover .vgo {
  opacity: 1;
}
.vgo:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.vgo:disabled {
  opacity: 0;
  pointer-events: none;
}
.vgo .icon {
  width: 13px;
  height: 13px;
}

.vempty {
  padding: 36px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}
</style>
