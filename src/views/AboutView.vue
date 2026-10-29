<script setup>
import { computed } from "vue";
import { S } from "../store.js";

const rows = computed(() => [
  ["应用版本", S.info?.version || "3.0.0"],
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
</script>

<template>
  <section class="page">
    <header class="ph">
      <div>
        <h1>关于</h1>
      </div>
    </header>

    <div class="grid">
      <div class="card hero">
        <div class="logo">
          <svg viewBox="0 0 16 16"><path d="M7.2 1.6v7.1a1.9 1.9 0 0 1-1.9 1.9 1.9 1.9 0 0 1-1.9-1.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M11.3 1.4h2.4v6.6a2.3 2.3 0 0 1-4.6 0v-.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M3 14.2h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" opacity=".55"/></svg>
        </div>
        <div>
          <div class="hname">Java 开发工具</div>
        </div>
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
  height: 100%;
  overflow-y: auto;
  padding: 8px 4px 4px;
}
.ph {
  padding: 4px 4px 16px;
}
h1 {
  font-family: var(--font-display);
  font-size: 25px;
  line-height: 32px;
  font-weight: 600;
  letter-spacing: -0.2px;
}
.ph p {
  margin-top: 3px;
  font-size: 12.5px;
  color: var(--text-2);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
  padding: 0 4px 16px;
}
.card {
  background: var(--layer);
  border: 1px solid var(--stroke);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 18px 20px;
}
.hero {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 15px 18px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 10%, var(--layer)) 0%,
    var(--layer) 60%
  );
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: linear-gradient(145deg, var(--accent), #2f83ff);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 12px rgba(0, 90, 234, 0.3);
}
.logo svg {
  width: 22px;
  height: 22px;
}
.hname {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
}

.ctitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 10px;
}
.kv {
  display: flex;
  flex-direction: column;
}
.kvrow {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
  font-size: 12.5px;
  color: var(--text-2);
  border-bottom: 1px solid var(--stroke);
}
.kvrow:last-child {
  border-bottom: none;
}
.kvrow b {
  font-weight: 500;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  max-width: 62%;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
