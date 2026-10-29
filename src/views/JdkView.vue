<script setup>
import { computed } from "vue";
import { S, refreshEnv, switchJdk, addPath, openStore } from "../store.js";
import VersionPanel from "../components/VersionPanel.vue";

const items = computed(() =>
  S.jdks.map((j) => ({
    ver: j.ver,
    impl: j.impl || (j.jdk ? "" : "仅 JRE"),
    arch: j.arch,
    path: j.path,
  }))
);

const cur = computed(() => (S.activeJdk.ver ? "Java " + S.activeJdk.ver : ""));
</script>

<template>
  <VersionPanel
    title="JDK 版本"
    subtitle="双击即可切换版本。"
    family="JDK"
    :current-ver="cur"
    :current-path="S.activeJdk.path"
    note-label="JAVA_HOME"
    :note-value="S.javaHome"
    :items="items"
    :busy="S.busy === 'jdk'"
    empty-text="未检测到 JDK，点击右上角「添加目录」或「版本库」装一个"
    @refresh="refreshEnv"
    @add="addPath('jdk')"
    @store="openStore('jdk')"
    @switch="switchJdk"
  />
</template>
