<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import {
  S,
  closeStore,
  loadStore,
  installRuntime,
  cancelInstall,
  removeRuntime,
  switchJdk,
  switchNode,
} from "../store.js";

// 直接绑到全局状态：由 JdkView / NodeView 决定打开时看哪个页签
const kind = computed({
  get: () => S.store.kind,
  set: (v) => (S.store.kind = v),
});

const items = computed(() => (kind.value === "jdk" ? S.store.jdk : S.store.node));const roots = computed(() => S.store.roots || {});
const activePath = computed(() =>
  (kind.value === "jdk" ? S.activeJdk.path : S.activeNode.path || "").toLowerCase()
);

const isActive = (it) => (it.installedPath || "").toLowerCase() === activePath.value;
const managed = (it) => {
  const root = (roots.value[kind.value] || "").toLowerCase();
  const p = (it.installedPath || "").toLowerCase();
  return !!root && p.startsWith(root + "\\");
};

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
  installRuntime({ ...it, kind: kind.value });
}
function cancel(it) {
  cancelInstall(it.id);
}
function sw(it) {
  kind.value === "jdk" ? switchJdk(it.installedPath) : switchNode(it.installedPath);
}
function rm(it) {
  removeRuntime({ ...it, kind: kind.value });
}

function onKey(e) {
  if (e.key === "Escape" && S.store.open) closeStore();
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
              <p>选一个大版本，下载后自动解压并切换。不写注册表，不装系统服务。</p>
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
                  <button class="btn sm" @click="inst(it)">重试</button>
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
            <span class="path">
              安装到 <b>{{ roots[kind] || "…" }}</b>
            </span>
            <span class="grow" />
            <button class="btn" @click="closeStore">关闭</button>
          </footer>
        </div>
      </div>
    </Transition>
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
  padding: 12px 16px 12px 24px;
  border-top: 1px solid var(--stroke);
  background: var(--layer-3);
}
.pfoot .path {
  font-size: 11.5px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pfoot .path b {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-2);
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
