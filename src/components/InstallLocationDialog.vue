<script setup>
import { computed, onMounted, onUnmounted } from "vue";
import {
  S,
  closeAsk,
  confirmAsk,
  pickAskRoot,
  setAskMode,
  useDefaultRoot,
  askRoot,
} from "../store.js";

const ask = computed(() => S.store.ask);
const sug = computed(() => ask.value?.suggested || {});
const root = computed(() => askRoot());
const kindName = computed(() => (ask.value?.kind === "node" ? "Node" : "JDK"));
const sameAsCurrent = computed(
  () => root.value && root.value.toLowerCase() === String(ask.value?.current || "").toLowerCase()
);

function onInput(e) {
  if (!ask.value) return;
  ask.value.custom = e.target.value;
  setAskMode("custom");
}

// 版本库面板也在监听 Esc，这里先吃掉事件，避免一次按键把两层都关掉
function onKey(e) {
  if (e.key === "Escape" && ask.value?.open) {
    e.stopPropagation();
    closeAsk();
  }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onUnmounted(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <Teleport to="body">
    <Transition name="loc">
      <div v-if="ask && ask.open" class="scrim" @click.self="closeAsk">
        <div class="card" role="dialog" aria-modal="true">
          <header class="hd">
            <span class="ico">
              <svg viewBox="0 0 24 24">
                <path d="M3 7.2A1.2 1.2 0 0 1 4.2 6h5l1.8 2H19.8A1.2 1.2 0 0 1 21 9.2v8.6A1.2 1.2 0 0 1 19.8 19H4.2A1.2 1.2 0 0 1 3 17.8z" />
              </svg>
            </span>
            <div class="ht">
              <h3>安装 {{ ask.label }} · 先选个位置</h3>
              <p>会在这里建一个独立子目录（如 zulu-25.0.1），不覆盖你已有的版本。</p>
            </div>
          </header>

          <div v-if="ask.pending" class="loading">
            <i class="spin" />
            <span>正在检查你已有的 {{ kindName }} 装在哪…</span>
          </div>

          <div v-else class="opts">
            <!-- 有建议：和现有版本放一起 -->
            <div
              v-if="sug.root"
              class="opt"
              :class="{ on: ask.mode === 'suggested' }"
              role="radio"
              :aria-checked="ask.mode === 'suggested'"
              tabindex="0"
              @click="setAskMode('suggested')"
            >
              <i class="radio" />
              <div class="body">
                <div class="t">
                  和现有版本放在一起
                  <em class="rec">推荐</em>
                  <em v-if="sug.writable === false" class="warn">可能不可写</em>
                </div>
                <code class="p">{{ sug.root }}</code>
                <div class="m">
                  检测到 {{ sug.count }} 个已有版本：{{ sug.names.join("、") }}{{ sug.count > sug.names.length ? "…" : "" }}
                </div>
              </div>
            </div>

            <!-- 自定义 -->
            <div
              class="opt"
              :class="{ on: ask.mode === 'custom' }"
              role="radio"
              :aria-checked="ask.mode === 'custom'"
              tabindex="0"
              @click="setAskMode('custom')"
            >
              <i class="radio" />
              <div class="body">
                <div class="t">自定义位置</div>
                <div class="inline">
                  <input
                    class="inp"
                    :value="ask.custom"
                    placeholder="例如 E:\develop\Java"
                    spellcheck="false"
                    @focus="setAskMode('custom')"
                    @input="onInput"
                  />
                  <button class="pick" @click.stop="pickAskRoot">选择…</button>
                </div>
                <div v-if="!sug.root" class="m">建议选一个空间充足的分区，别放在 C 盘的用户目录里</div>
                <div v-else-if="sameAsCurrent" class="m">和当前设置的位置相同</div>
              </div>
            </div>
          </div>

          <!-- 没检测到已有版本：明确提示别默认塞 C 盘 -->
          <div v-if="!ask.pending && !sug.root" class="note">
            <svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.2v.1" /><circle cx="12" cy="12" r="9" /></svg>
            <span>
              没找到你已有的 {{ kindName }}。程序默认位置在 C 盘（<code>{{ ask.defaultRoot }}</code>），
              重装系统或清理 C 盘时容易被一起删掉，建议先选一个常用目录。
            </span>
            <button class="link" @click="useDefaultRoot">就用默认位置</button>
          </div>

          <div v-else-if="!ask.pending && sameAsCurrent" class="note soft">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
            <span>这就是上次用的位置，装完直接切过去。</span>
          </div>

          <div v-if="ask.err" class="err">{{ ask.err }}</div>

          <footer class="ft">
            <button
              class="chk"
              role="checkbox"
              :aria-checked="ask.remember"
              @click="ask.remember = !ask.remember"
            >
              <i class="box" :class="{ on: ask.remember }">
                <svg v-if="ask.remember" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg>
              </i>
              <span>以后 {{ kindName }} 都装到这里</span>
            </button>
            <span class="grow" />
            <button class="btn" @click="closeAsk">取消</button>
            <button class="btn primary" :disabled="!root || ask.pending" @click="confirmAsk">
              <svg class="icon" viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 19h14" /></svg>
              开始安装
            </button>
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
  z-index: 140;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(5px);
}

.card {
  width: 560px;
  max-width: 100%;
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  background: var(--layer-hover);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(40px) saturate(1.5);
  overflow: hidden;
}

/* ── 头部 ── */
.hd {
  display: flex;
  gap: 14px;
  padding: 22px 24px 16px;
}
.ico {
  flex: none;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
}
.ico svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
}
.ht h3 {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.2px;
}
.ht p {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-2);
}

/* ── 选项 ── */
.loading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 24px 10px;
  padding: 22px 15px;
  border-radius: var(--radius);
  border: 1px dashed var(--stroke-strong);
  font-size: 12.5px;
  color: var(--text-2);
}
.spin {
  flex: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.6px solid var(--stroke-strong);
  border-top-color: var(--accent);
  animation: spin 700ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.opts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 24px 4px;
}
.opt {
  display: flex;
  gap: 12px;
  padding: 13px 15px;
  border-radius: var(--radius);
  border: 1px solid var(--stroke);
  background: var(--layer-2);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.opt:hover {
  background: var(--layer);
  border-color: var(--stroke-strong);
}
.opt.on {
  border-color: var(--accent-stroke);
  background: var(--accent-soft);
}
.opt:focus-visible {
  outline: 2px solid var(--accent-stroke);
  outline-offset: 1px;
}

.radio {
  flex: none;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1.5px solid var(--stroke-strong);
  background: var(--layer-hover);
  position: relative;
  transition: border-color var(--dur-fast) var(--ease);
}
.opt.on .radio {
  border-color: var(--accent);
}
.opt.on .radio::after {
  content: "";
  position: absolute;
  inset: 3px;
  border-radius: 50%;
  background: var(--accent);
}

.body {
  flex: 1;
  min-width: 0;
}
.t {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}
.rec {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-stroke);
}
.warn {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-style: normal;
  font-weight: 600;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.p {
  display: block;
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  word-break: break-all;
}
.m {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 17px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inline {
  display: flex;
  gap: 8px;
  margin-top: 7px;
}
.inp {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--stroke-strong);
  background: var(--layer-hover);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
}
.inp::placeholder {
  color: var(--text-3);
}
.inp:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.pick {
  flex: none;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--stroke-strong);
  background: var(--layer-2);
  font-size: 12.5px;
  color: var(--text);
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.pick:hover {
  background: var(--hover);
  border-color: var(--accent-stroke);
  color: var(--accent);
}

/* ── 提示 / 错误 ── */
.note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 24px 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  font-size: 12px;
  line-height: 18px;
  color: var(--text-2);
  background: color-mix(in srgb, var(--warning) 11%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning) 34%, transparent);
}
.note.soft {
  background: var(--layer-3);
  border-color: var(--stroke);
  color: var(--text-3);
}
.note svg {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.note code {
  font-family: var(--font-mono);
  font-size: 11.5px;
}
.note .link {
  flex: none;
  align-self: center;
  margin-left: auto;
  font-size: 12px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.err {
  margin: 10px 24px 0;
  font-size: 12px;
  color: var(--danger);
}

/* ── 底部 ── */
.ft {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 13px 20px 13px 24px;
  border-top: 1px solid var(--stroke);
  background: var(--layer-3);
}
.grow {
  flex: 1;
}
.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}
.chk:hover {
  color: var(--text);
}
.box {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  border: 1.5px solid var(--stroke-strong);
  background: var(--layer-hover);
  transition: background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
}
.box.on {
  background: var(--accent);
  border-color: var(--accent);
}
.box svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ft .btn {
  min-width: 78px;
}

/* ── 动效 ── */
.loc-enter-active,
.loc-leave-active {
  transition: opacity 140ms var(--ease);
}
.loc-enter-active .card,
.loc-leave-active .card {
  transition: transform 200ms var(--ease-out), opacity 140ms var(--ease);
}
.loc-enter-from,
.loc-leave-to {
  opacity: 0;
}
.loc-enter-from .card,
.loc-leave-to .card {
  opacity: 0;
  transform: scale(0.98) translateY(5px);
}
</style>
