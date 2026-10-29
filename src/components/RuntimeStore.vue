<script setup>
import { computed, ref, onMounted, onUnmounted } from "vue";
import {
  S,
  closeStore,
  loadStore,
  askInstall,
  cancelInstall,
  removeRuntime,
  changeStoreRoot,
  resetStoreRoot,
  switchJdk,
  switchNode,
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
const phaseText = (it) => {
  const d = dl(it);
  if (!d) return "";
  if (d.phase === "extract") return "解压中…";
  if (d.phase === "error") return d.error || "失败";
  const speed = d.speed ? " · " + fmtBytes(d.speed) + "/s" : "";
  if (!d.total) return fmtBytes(d.got) + speed;
  return `${d.pct}% · ${fmtBytes(d.got)} / ${fmtBytes(d.total)}${speed}`;
};

function inst(it) {
  askInstall({ ...it, kind: kind.value });
}
function cancel(it) {
  cancelInstall(it.id);
}
function sw(it) {
  kind.value === "jdk" ? switchJdk(it.installedPath) : switchNode(it.installedPath);
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
  if (e.key === "Escape" && S.store.open && !S.store.ask) closeStore();
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <Transition name="store">
      <div v-if="S.store.open" class="scrim" @click.self="closeStore">
        <div class="panel" role="dialog">
          <header class="phead">
            <div>
              <h2>版本库</h2>
              <p>选一个大版本，下载后自动解压并切换。装之前会让你确认装到哪个目录，不写注册表。</p>
            </div>
            <button class="xbtn" title="关闭" @click="closeStore">
              <svg class="icon" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </header>

          <div class="seg">
            <button :class="{ on: kind === 'jdk' }" @click="kind = 'jdk'">
              JDK <span class="n">{{ S.store.jdk.length }}</span>
            </button>
            <button :class="{ on: kind === 'node' }" @click="kind = 'node'">
              Node <span class="n">{{ S.store.node.length }}</span>
            </button>
            <span class="grow" />
            <button class="btn ghost sm" :disabled="S.store.loading" @click="loadStore">
              <svg class="icon" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-1.9 5.2"/><path d="M20 5v6h-6"/></svg>
              刷新
            </button>
          </div>

          <div class="rows">
            <div v-for="it in items" :key="it.id" class="row" :class="{ act: isActive(it) }">
              <div class="vcol">
                <div class="l1">
                  <b>{{ it.label }}</b>
                  <em v-if="it.tag" class="tag" :class="it.tag.toLowerCase()">{{ it.tag }}</em>
                  <em v-if="isActive(it)" class="tag now">当前使用</em>
                </div>
                <div class="l2">
                  <span>{{ it.vendor }} {{ it.installedVer || it.ver }}</span>
                  <span v-if="!it.installedPath && it.sizeMb" class="dot">·</span>
                  <span v-if="!it.installedPath && it.sizeMb" class="sz">下载约 {{ it.sizeMb }} MB</span>
                  <span v-if="it.installedPath && managed(it)" class="dot">·</span>
                  <span v-if="it.installedPath && managed(it)" class="sz">版本库内</span>
                </div>
              </div>

              <div class="acol">
                <!-- 下载 / 解压中 -->
                <div v-if="running(it)" class="prog">
                  <div class="pbar"><i :style="{ width: (dl(it)?.phase === 'extract' ? 100 : pct(it)) + '%' }" /></div>
                  <span class="pinfo">{{ phaseText(it) }}</span>
                  <button class="btn ghost sm" @click="cancel(it)">取消</button>
                </div>

                <!-- 刚装完，等列表刷新 -->
                <div v-else-if="justDone(it)" class="prog">
                  <span class="pinfo done">安装完成，正在切换…</span>
                </div>

                <!-- 失败 -->
                <div v-else-if="failed(it)" class="fail">
                  <span class="perr" :title="dl(it)?.error">{{ phaseText(it) }}</span>
                  <button class="btn sm" @click="retry(it)">重试</button>
                </div>

                <!-- 已安装 -->
                <template v-else-if="it.installedPath">
                  <button v-if="!isActive(it)" class="btn sm" @click="sw(it)">切换</button>
                  <button
                    v-if="!isActive(it) && managed(it)"
                    class="btn danger sm"
                    @click="rm(it)"
                  >
                    删除
                  </button>
                </template>

                <!-- 未安装 -->
                <button v-else class="btn primary sm" @click="inst(it)">
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
              <em v-if="!customRoot[kind]" class="def">默认（C 盘）</em>
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
      :message="
        pendingName +
        ' 会从版本库里彻底删除，不进回收站，也无法恢复。需要时可以在版本库重新下载安装。'
      "
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
  background: rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(4px);
}

.panel {
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: 100%;
  max-height: min(720px, calc(100vh - 56px));
  border-radius: var(--radius-xl);
  background: var(--layer-hover);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(40px) saturate(1.5);
  overflow: hidden;
}

.phead {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 20px 14px 24px;
}
.phead h2 {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.2px;
}
.phead p {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-2);
}
.xbtn {
  flex: none;
  width: 30px;
  height: 30px;
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

.seg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px 12px 24px;
}
.seg > button:not(.btn) {
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
  border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
.seg > button:not(.btn):hover {
  background: var(--hover);
  color: var(--text);
}
.seg > button.on {
  background: var(--accent-soft);
  border-color: var(--accent-stroke);
  color: var(--accent);
}
.seg .n {
  margin-left: 5px;
  font-size: 11px;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
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
  padding: 0 16px 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--layer-2);
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.row:hover {
  background: var(--layer);
  border-color: var(--stroke-strong);
}
.row.act {
  border-color: var(--accent-stroke);
  background: color-mix(in srgb, var(--accent) 5%, var(--layer-2));
}

.vcol {
  flex: 1;
  min-width: 0;
}
.l1 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.l1 b {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--text-2);
  background: var(--hover);
}
.tag.lts {
  color: var(--accent);
  background: var(--accent-soft);
}
.tag.now {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}
.l2 {
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.l2 .dot {
  margin: 0 5px;
  opacity: 0.5;
}
.sz {
  font-variant-numeric: tabular-nums;
}

.acol {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 96px;
  justify-content: flex-end;
}
.btn.sm {
  height: 28px;
  padding: 0 11px;
  font-size: 12.5px;
}
.btn.sm .icon {
  width: 14px;
  height: 14px;
}

/* 进度 */
.prog {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 258px;
}
.pbar {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--hover);
  overflow: hidden;
}
.pbar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 160ms linear;
}
.pinfo {
  font-size: 11.5px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pinfo.done {
  color: var(--success);
}

.fail {
  display: flex;
  align-items: center;
  gap: 8px;
}
.perr {
  max-width: 170px;
  font-size: 11.5px;
  color: var(--danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 40px;
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
}

.pfoot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 16px 11px 22px;
  border-top: 1px solid var(--stroke);
  background: var(--layer-3);
}
.pfoot .loc {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
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
  font-size: 11.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pfoot .def {
  flex: none;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10.5px;
  font-style: normal;
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 12%, transparent);
}
.pfoot .lnk {
  flex: none;
  padding: 0 2px;
  font-size: 11.5px;
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
  transition: opacity 150ms var(--ease);
}
.store-enter-active .panel,
.store-leave-active .panel {
  transition: transform 220ms var(--ease-out), opacity 150ms var(--ease);
}
.store-enter-from,
.store-leave-to {
  opacity: 0;
}
.store-enter-from .panel,
.store-leave-to .panel {
  opacity: 0;
  transform: scale(0.98) translateY(6px);
}
</style>
