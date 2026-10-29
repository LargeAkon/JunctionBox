<script setup>
import { computed } from "vue";
import { S, refreshEnv, switchNode, addPath, openStore } from "../store.js";
import VersionPanel from "../components/VersionPanel.vue";

const items = computed(() =>
  S.nodes.map((n) => ({
    ver: n.ver,
    impl: n.npm ? "npm " + n.npm : "",
    arch: n.arch,
    path: n.path,
  }))
);

const cur = computed(() => (S.activeNode.ver ? "Node " + S.activeNode.ver : ""));
const npmPrefix = computed(() => S.info?.npmPrefix || "");
</script>

<template>
  <VersionPanel
    title="Node 版本"
    subtitle="双击即可切换版本。"
    family="Node"
    :current-ver="cur"
    :current-path="S.activeNode.path"
    note-label="全局包目录"
    :note-value="npmPrefix"
    :items="items"
    :busy="S.busy === 'node'"
    empty-text="未检测到 Node，点击右上角「添加目录」或「版本库」装一个"
    @refresh="refreshEnv"
    @add="addPath('node')"
    @store="openStore('node')"
    @switch="switchNode"
  />
</template>
