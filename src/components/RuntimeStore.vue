<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import {
  S,
  closeStore,
  loadStore,
  installRuntime,
  cancelInstall,
  removeRuntime,
  changeStoreRoot,
  resetStoreRoot,
} from "../store.js";
import ConfirmDialog from "./ConfirmDialog.vue";

// 直接绑到全局状态：由 JdkView / NodeView 决定打开时看哪个页签
const kind = computed({
  get: () => S.store.kind,
  set: (v) => (S.store.kind = v),
});

const items = computed(() => (kind.value === "jdk" ? S.store.jdk : S.store.node));
const roots = computed(() => S.store.roots || {});
const customRoot = computed(() => S.store.customRoot || {});
const activePath = computed(() =>
  (kind.value === "jdk" ? S.activeJdk.path : S.activeNode.path || "").toLowerCase()
);

const isActive = (it) => (it.installedPath || "").toLowerCase() === activePath.value;
// 只有本程序装的才显示「删除」：安装位置可以指到用户自己的 JDK 目录，
// 那里的版本是人家自己的环境，不能给一个删除按钮
const managed = (it) => !!it.managed;

// 默认位置不一定在 C 盘（兼容老的 runtimes.txt 配置），文案不能写死
const defaultOnC = computed(() => /^[a-c]:/i.test(String((S.store.defaultRoot || {})[kind.value] || "")));

const dl = (it) => S.dl[it.id];
const running = (it) => {
  const d = dl(it);
  return d && ["download", "extract"].includes(d.phase);
};
const failed = (it) => dl(it)?.phase === "error";
const justDone = (it) => dl(it)?.phase === "done";

const fmtBytes = (n) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < 3) {
    v /= 1024;
    i++;
  }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + " " + u[i];
};

const pct = (it) => dl(it)?.pct || 0;
// 整行从左往右铺满：解压阶段没有字节进度，直接给满格
const fillW = (it) => (dl(it)?.phase === "extract" ? 100 : pct(it)) + "%";
const phaseText = (it) => {
  const d = dl(it);
  if (!d) return "";
  if (d.phase === "extract") return "解压中…";
  if (d.phase === "done") return "已完成";
  if (d.phase === "error") return d.error || "失败";
  const speed = d.speed ? " · " + fmtBytes(d.speed) + "/s" : "";
  if (!d.total) return fmtBytes(d.got) + speed;
  return `${d.pct}% · ${fmtBytes(d.got)} / ${fmtBytes(d.total)}${speed}`;
};

// 点「安装」直接开下载：位置就写在这一行下面，不再弹窗问一遍
function inst(it) {
  installRuntime({ ...it, kind: kind.value }, roots.value[kind.value] || "");
}
function cancel(it) {
  cancelInstall(it.id);
}
// 删除是不可恢复的物理删除（不进回收站），所以必须先确认一次
const pending = ref(null);
const pendingName = computed(() => {
  const it = pending.value;
  if (!it) return "";
  const base = (it.installedPath || "").split(/[\\/]/).filter(Boolean).pop() || "";
  return [it.installedVer || it.label || "", base].filter(Boolean).join(" · ");
});

function rm(it) {
  pending.value = it;
}
function doRemove() {
  const it = pending.value;
  pending.value = null;
  if (it) removeRuntime({ ...it, kind: kind.value });
}
function retry(it) {
  delete S.dl[it.id];
  inst(it);
}
function pickRoot() {
  changeStoreRoot(kind.value, roots.value[kind.value]);
}
function useDefault() {
  resetStoreRoot(kind.value);
}

// 用户目录太长，把家目录换成 ~ 才放得进一行
function shortPath(p) {
  if (!p) return "…";
  const home = S.info?.home || "";
  if (home && p.toLowerCase().startsWith(home.toLowerCase())) return "~" + p.slice(home.length);
  return p;
}

function onKey(e) {
  if (e.key === "Escape" && S.store.open && !pending.value) closeStore();
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="store">
      <div v-if="S.store.open" class="scrim" @click.self="closeStore">
        <div class="panel" role="dialog" aria-modal="true" aria-label="版本库">
          <header class="phead">
            <div>
              <h2>版本库</h2>
              <p>下载解压到下方位置，装完回列表切换。</p>
            </div>
            <button class="xbtn" title="关闭" @click="closeStore">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </header>

          <div class="bar">
            <div class="seg">
              <button :class="{ on: kind === 'jdk' }" @click="kind = 'jdk'">JDK</button>
              <button :class="{ on: kind === 'node' }" @click="kind = 'node'">Node</button>
            </div>
            <span class="grow" />
            <button class="btn ghost sm" :disabled="S.store.loading" @click="loadStore">
              <svg class="icon" viewBox="0 0 24 24" :class="{ spin: S.store.loading }"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
              刷新
            </button>
          </div>

          <div class="rows">
            <div
              v-for="it in items"
              :key="it.id"
              class="row"
              :class="{ act: isActive(it), live: running(it) }"
            >
              <!-- 进度水填充：从左侧铺满整行，文字浮在它上面 -->
              <i v-if="running(it) || justDone(it)" class="fill" :style="{ width: fillW(it) }" />

              <div class="vcol">
                <div class="l1">
                  <b>{{ it.label }}</b>
                  <em v-if="it.tag" class="tag" :class="it.tag.toLowerCase()">{{ it.tag }}</em>
                  <em v-if="isActive(it)" class="tag now">当前使用</em>
                  <em v-else-if="it.installedPath" class="tag hastag">已安装</em>
                </div>
                <div class="l2">
                  <span>{{ it.vendor }} {{ it.installedVer || it.ver }}</span>
                  <template v-if="!it.installedPath && it.sizeMb">
                    <span class="dot">·</span>
                    <span class="sz">下载约 {{ it.sizeMb }} MB</span>
                  </template>
                </div>
              </div>

              <div class="acol">
                <!-- 下载 / 解压中 -->
                <div v-if="running(it)" class="prog">
                  <span class="pinfo">{{ phaseText(it) }}</span>
                  <button class="btn ghost sm" @click="cancel(it)">取消</button>
                </div>

                <!-- 刚装完，等面板收起 -->
                <span v-else-if="justDone(it)" class="pinfo ok">{{ phaseText(it) }}</span>

                <!-- 失败 -->
                <div v-else-if="failed(it)" class="fail">
                  <span class="perr" :title="dl(it)?.error">{{ phaseText(it) }}</span>
                  <button class="btn sm" @click="retry(it)">重试</button>
                </div>

                <!-- 已装好：只给删除，切换去列表做 -->
                <button
                  v-else-if="it.installedPath && managed(it) && !isActive(it)"
                  class="btn danger sm"
                  @click="rm(it)"
                >
                  删除
                </button>

                <!-- 未安装 -->
                <button v-else-if="!it.installedPath" class="btn primary sm" @click="inst(it)">
                  <svg class="icon" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>
                  安装
                </button>
              </div>
            </div>

            <div v-if="!items.length" class="empty">清单为空</div>
          </div>

          <footer class="pfoot">
            <div class="loc">
              <svg class="fico" viewBox="0 0 24 24">
                <path d="M3 7.2A1.2 1.2 0 0 1 4.2 6h5l1.8 2H19.8A1.2 1.2 0 0 1 21 9.2v8.6A1.2 1.2 0 0 1 19.8 19H4.2A1.2 1.2 0 0 1 3 17.8z" />
              </svg>
              <span class="lbl">安装到</span>
              <code class="p" :title="roots[kind]">{{ shortPath(roots[kind]) }}</code>
              <em v-if="!customRoot[kind]" class="def">{{ defaultOnC ? "默认（C 盘）" : "默认" }}</em>
              <button class="lnk" @click="pickRoot">更改</button>
              <button v-if="customRoot[kind]" class="lnk" @click="useDefault">恢复默认</button>
            </div>
            <button class="btn" @click="closeStore">关闭</button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- 删除不可撤销（不走回收站），先让人确认一次 -->
    <ConfirmDialog
      :open="!!pending"
      title="删除这个版本？"
      :message="pendingName + ' 会被彻底删除，不进回收站，无法恢复。'"
      ok-text="删除"
      danger
      @close="pending = null"
      @ok="doRemove"
    />
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 28px;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}

.panel {
  display: flex;
  flex-direction: column;
  width: 700px;
  max-width: 100%;
  max-height: min(700px, calc(100vh - 56px));
  border-radius: var(--radius-xl);
  background: var(--bg);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.phead {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 18px 12px 20px;
}
.phead h2 {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text);
}
.phead p {
  margin-top: 3px;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-3);
}
.xbtn {
  flex: none;
  width: 28px;
  height: 28px;
  margin-left: auto;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.xbtn:hover {
  background: var(--hover);
  color: var(--text);
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px 12px 20px;
  border-bottom: 1px solid var(--stroke);
}
.grow {
  flex: 1;
}

.rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 11px 13px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--layer);
  overflow: hidden;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.row:hover {
  background: var(--layer-hover);
  border-color: var(--stroke-strong);
}
.row.act {
  border-color: var(--ink);
  background: var(--layer);
  box-shadow: var(--shadow-sm);
}
.row.live {
  border-color: var(--accent-stroke);
}

/* 进度：整行从左往右灌满 */
.fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    var(--accent-soft) 0%,
    color-mix(in srgb, var(--accent) 14%, transparent) 100%
  );
  border-right: 1px solid var(--accent-stroke);
  transition: width 180ms linear;
  pointer-events: none;
}

.vcol {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
}
.l1 {
  display: flex;
  align-items: center;
  gap: 7px;
}
.l1 b {
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}
.tag {
  padding: 0 5px;
  height: 17px;
  line-height: 17px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-3);
  background: var(--bg-sunken);
}
.tag.lts {
  color: var(--accent);
  background: var(--accent-soft);
}
.tag.now {
  color: var(--success);
  background: var(--success-soft);
}
.l2 {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.l2 .dot {
  margin: 0 5px;
  opacity: 0.5;
}

.acol {
  position: relative;
  z-index: 1;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 96px;
  justify-content: flex-end;
}
.row.live .acol {
  min-width: 236px;
}

/* 进度文案 */
.prog {
  display: flex;
  align-items: center;
  gap: 9px;
}
.pinfo {
  font-size: 11px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pinfo.ok {
  color: var(--success);
  font-weight: 550;
}

.fail {
  display: flex;
  align-items: center;
  gap: 7px;
}
.perr {
  max-width: 160px;
  font-size: 11px;
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 36px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}

.pfoot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px 10px 20px;
  border-top: 1px solid var(--stroke);
  background: var(--bg-sub);
}
.pfoot .loc {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-3);
}
.pfoot .fico {
  flex: none;
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linejoin: round;
  opacity: 0.8;
}
.pfoot .lbl {
  flex: none;
}
.pfoot .p {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pfoot .def {
  flex: none;
  padding: 0 5px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-style: normal;
  color: var(--warning);
  background: var(--warning-soft);
}
.pfoot .lnk {
  flex: none;
  padding: 0 2px;
  font-size: 11px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pfoot .lnk:hover {
  color: var(--accent-hover);
}
.pfoot .btn {
  flex: none;
}

.store-enter-active,
.store-leave-active {
  transition: opacity 130ms var(--ease);
}
.store-enter-active .panel,
.store-leave-active .panel {
  transition: transform 200ms var(--ease-out), opacity 130ms var(--ease);
}
.store-enter-from,
.store-leave-to {
  opacity: 0;
}
.store-enter-from .panel,
.store-leave-to .panel {
  transform: scale(0.985) translateY(6px);
  opacity: 0;
}
</style>
