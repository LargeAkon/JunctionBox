<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  title: String,
  subtitle: String,
  icon: { type: String, default: "jdk" },
  currentVer: String,
  currentPath: String,
  noteLabel: String,
  noteValue: String,
  items: { type: Array, default: () => [] },
  busy: Boolean,
  emptyText: { type: String, default: "未检测到已安装的版本" },
});
const emit = defineEmits(["refresh", "add", "switch"]);

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
      <div>
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="ph-act">
        <button class="btn" @click="emit('add')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          添加目录
        </button>
        <button class="btn" @click="emit('refresh')">
          <svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
          重新检测
        </button>
      </div>
    </header>

    <!-- 当前生效版本 -->
    <div class="current">
      <div class="cur-left">
        <div class="cur-label">当前生效</div>
        <div class="cur-ver">
          <span v-if="currentVer">{{ currentVer }}</span>
          <span v-else class="none">未检测到</span>
        </div>
        <div class="cur-path selectable">{{ currentPath || "PATH 中未找到可执行文件" }}</div>
        <div v-if="noteValue" class="cur-note">{{ noteLabel }} <b class="selectable">{{ noteValue }}</b></div>
      </div>
    </div>

    <!-- 版本列表 -->
    <div class="listhead">
      <span>已安装 <b>{{ items.length }}</b> 个版本</span>
      <span class="grow"/>
      <button
        class="btn primary"
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
        <div class="vmain">
          <div class="vline1">
            <b class="vver">{{ it.ver }}</b>
            <span class="vven">{{ it.impl || "" }}</span>
          </div>
          <div class="vpath selectable">{{ it.path }}</div>
        </div>
        <div class="vmeta">
          <em v-if="it.arch" class="chip">{{ it.arch }}</em>
          <em v-if="isActive(it)" class="chip java">当前使用</em>
          <em v-else-if="sel === it.path" class="chip accent">已选择</em>
        </div>
        <button class="vgo" :disabled="isActive(it)" @click.stop="dbl(it)">
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>

      <div v-if="!items.length" class="vempty">{{ emptyText }}</div>
    </div>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 8px 4px 0;
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

/* 当前版本卡 */
.current {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px 20px;
  margin: 0 4px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 9%, var(--layer)) 0%,
    var(--layer) 62%
  );
  box-shadow: var(--shadow);
  overflow: hidden;
}
.current::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    120% 140% at 100% 0%,
    color-mix(in srgb, var(--accent) 14%, transparent) 0%,
    transparent 58%
  );
  pointer-events: none;
}
.cur-label {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-3);
  text-transform: uppercase;
}
.cur-ver {
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: 30px;
  line-height: 38px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.6px;
  font-variant-numeric: tabular-nums;
}
.cur-ver .none {
  font-size: 20px;
  color: var(--text-3);
}
.cur-path {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-2);
}
.cur-note {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--text-3);
}
.cur-note b {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-2);
}
/* 列表头 */
.listhead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 10px;
  font-size: 12px;
  color: var(--text-3);
}
.listhead b {
  color: var(--text-2);
  font-weight: 600;
}
.grow {
  flex: 1;
}

/* 版本行 */
.vlist {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 4px 4px;
}

.vrow {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px 13px 18px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--layer);
  box-shadow: var(--shadow-sm);
  transition: background var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.vrow:hover {
  background: var(--layer-hover);
  border-color: var(--stroke-strong);
}
.vrow.sel {
  border-color: var(--accent-stroke);
  box-shadow: 0 0 0 1px var(--accent-stroke), var(--shadow-sm);
}
.vrow.act {
  background: color-mix(in srgb, var(--accent) 5%, var(--layer));
}

.bar {
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
  transform: translateY(-50%);
  transition: height var(--dur) var(--ease);
}
.vrow.act .bar,
.vrow.sel .bar {
  height: 24px;
}

.vmain {
  flex: 1;
  min-width: 0;
}
.vline1 {
  display: flex;
  align-items: center;
  gap: 9px;
}
.vver {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.vven {
  font-size: 12px;
  color: var(--text-2);
}
.vpath {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vmeta {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 96px;
}
.vgo {
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 5px;
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

.vempty {
  padding: 40px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}
</style>
