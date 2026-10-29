<script setup>
defineProps({
  open: Boolean,
  title: { type: String, default: "确认操作" },
  message: { type: String, default: "" },
  okText: { type: String, default: "确定" },
  danger: Boolean,
});
const emit = defineEmits(["close", "ok"]);
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div v-if="open" class="scrim" @click.self="emit('close')">
        <div class="dialog" role="dialog">
          <div class="dhead">
            <span class="dtitle">{{ title }}</span>
          </div>
          <div class="dbody">{{ message }}</div>
          <div class="dfoot">
            <button class="btn" @click="emit('close')">取消</button>
            <button class="btn" :class="danger ? 'danger-solid' : 'primary'" @click="emit('ok')">
              {{ okText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  /* 确认层必须压在所有业务弹层之上：版本库 120、安装位置 140 */
  z-index: 400;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(3px);
}
.dialog {
  width: 420px;
  max-width: calc(100vw - 64px);
  border-radius: var(--radius-lg);
  background: var(--layer-hover);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(32px) saturate(1.4);
  overflow: hidden;
}
.dhead {
  padding: 20px 24px 0;
}
.dtitle {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.dbody {
  padding: 10px 24px 22px;
  font-size: 13px;
  line-height: 21px;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.dfoot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  background: var(--layer-3);
  border-top: 1px solid var(--stroke);
}
.dfoot .btn {
  min-width: 82px;
}
.danger-solid {
  background: var(--danger);
  border-color: transparent;
  color: #fff;
}
html.dark .danger-solid {
  color: #1a0505;
}
.danger-solid:hover {
  filter: brightness(1.08);
}

.dlg-enter-active,
.dlg-leave-active {
  transition: opacity 140ms var(--ease);
}
.dlg-enter-active .dialog,
.dlg-leave-active .dialog {
  transition: transform 200ms var(--ease-out), opacity 140ms var(--ease);
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
.dlg-enter-from .dialog,
.dlg-leave-to .dialog {
  opacity: 0;
  transform: scale(0.97) translateY(4px);
}
</style>
