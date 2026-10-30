<script setup>
import { computed } from "vue";
import { S, setTheme } from "../store.js";

const rows = computed(() => [
  ["应用版本", S.info?.version || "—"],
  ["Electron", S.info?.electron || "—"],
  ["Chromium", S.info?.chrome || "—"],
  ["Node（内置）", S.info?.node || "—"],
  ["操作系统", S.info?.os || "—"],
]);

const env = computed(() => [
  ["JAVA_HOME", S.javaHome || "未设置"],
  ["当前 JDK", S.activeJdk.path || "—"],
  ["当前 Node", S.activeNode.path || "—"],
  ["npm 全局目录", S.info?.npmPrefix || "—"],
]);

const modes = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "夜间" },
  { id: "system", label: "跟随系统" },
];

const theme = computed(() => S.theme.mode || "light");

function open(url) {
  window.api?.open(url);
}
</script>

<template>
  <section class="page">
    <div class="grid">
      <!-- 品牌 -->
      <div class="card hero">
        <div class="logo">
          <svg viewBox="0 0 16 16"><path d="M7.2 1.6v7.1a1.9 1.9 0 0 1-1.9 1.9 1.9 1.9 0 0 1-1.9-1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11.3 1.4h2.4v6.6a2.3 2.3 0 0 1-4.6 0v-.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 14.2h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>
        </div>
        <div class="hmeta">
          <div class="hname">
            JunctionBox
            <em class="chip">{{ S.info?.version ? "v" + S.info.version : "—" }}</em>
          </div>
          <div class="hsub">Windows 开发环境工具箱 · 端口检测 / JDK / Node 版本切换</div>
        </div>
        <div class="hlinks">
          <button class="btn sm" @click="open('https://github.com/LargeAkon/JunctionBox')">GitHub</button>
          <button
            class="btn sm"
            @click="open('https://github.com/LargeAkon/JunctionBox/issues')"
          >
            反馈问题
          </button>
        </div>
      </div>

      <!-- 外观：一行放完，不再占掉半屏 -->
      <div class="card appearance">
        <div class="ctitle">外观</div>
        <div class="seg">
          <button v-for="m in modes" :key="m.id" :class="{ on: theme === m.id }" @click="setTheme(m.id)">
            {{ m.label }}
          </button>
        </div>
        <p class="hint">
          {{ S.dark ? "夜间" : "浅色" }}{{ theme === "system" ? " · 跟随系统" : "" }} · 选择会记住
        </p>
      </div>

      <div class="card">
        <div class="ctitle">运行环境</div>
        <div class="kv">
          <div v-for="r in rows" :key="r[0]" class="kvrow">
            <span>{{ r[0] }}</span>
            <b class="selectable">{{ r[1] }}</b>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="ctitle">当前环境变量</div>
        <div class="kv">
          <div v-for="r in env" :key="r[0]" class="kvrow">
            <span>{{ r[0] }}</span>
            <b class="selectable ellip" :title="r[1]">{{ r[1] }}</b>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page {
  overflow-y: auto;
  padding-bottom: 8px;
}

.grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  padding: 16px 18px;
}
.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
}

/* 外观：标签 + 分段控件 + 说明，挤在一行里 */
.appearance {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 18px;
}
.appearance .ctitle {
  margin-bottom: 0;
  flex: none;
}
.appearance .seg {
  flex: none;
}
.appearance .hint {
  margin: 0 0 0 auto;
  flex: none;
  font-size: 11.5px;
  color: var(--text-3);
}
.logo {
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 10px;
  background: #0056d6;
  color: #fff;
  display: grid;
  place-items: center;
}
.logo svg {
  width: 21px;
  height: 21px;
}
.hmeta {
  flex: 1;
  min-width: 0;
}
.hname {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.hsub {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--text-3);
}
.hlinks {
  display: flex;
  gap: 6px;
  flex: none;
}

.ctitle {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.hint {
  font-size: 11.5px;
  color: var(--text-3);
}

.kv {
  display: flex;
  flex-direction: column;
}
.kvrow {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 0;
  font-size: 12px;
  color: var(--text-3);
  border-bottom: 1px solid var(--stroke);
}
.kvrow:last-child {
  border-bottom: none;
}
.kvrow b {
  font-weight: 500;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 11.5px;
  max-width: 66%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
