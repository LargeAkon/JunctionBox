<script setup>
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps({
  open: Boolean,
  title: { type: String, default: "确认操作" },
  message: { type: String, default: "" },
  okText: { type: String, default: "确定" },
  danger: Boolean,
});
const emit = defineEmits(["close", "ok"]);

const okBtn = ref(null);

// 确认框是最高优先级的交互：打开就聚焦在确认键上，回车即执行、Esc 即取消
function onKey(e) {
  if (!props.open) return;
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    emit("ok");
  }
}

watch(
  () => props.open,
  (v) => {
    if (v) requestAnimationFrame(() => okBtn.value?.focus?.());
  }
);

onMounted(() => window.addEventListener("keydown", onKey, true));
onUnmounted(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div v-if="open" class="scrim" @click.self="emit('close')">
        <div class="dialog" role="dialog" aria-modal="true">
          <div class="dhead">
            <span class="dtitle">{{ title }}</span>
          </div>
          <div class="dbody">{{ message }}</div>
          <div class="dfoot">
            <button class="btn" @click="emit('close')">取消</button>
            <button ref="okBtn" class="btn" :class="danger ? 'danger-solid' : 'primary'" @click="emit('ok')">
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
  background: var(--scrim);
  backdrop-filter: blur(2px);
}
.dialog {
  width: 400px;
  max-width: calc(100vw - 64px);
  border-radius: var(--radius-lg);
  background: var(--bg);
  border: 1px solid var(--stroke-strong);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.dhead {
  padding: 18px 20px 0;
}
.dtitle {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.dbody {
  padding: 8px 20px 20px;
  font-size: 12.5px;
  line-height: 20px;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
}
.dfoot {
  display: flex;
  justify-content: flex-end;
  gap: 7px;
  padding: 12px 14px;
  background: var(--bg-sub);
  border-top: 1px solid var(--stroke);
}
.dfoot .btn {
  min-width: 74px;
}
.danger-solid {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}
html.dark .danger-solid {
  color: #1a0505;
}
.danger-solid:hover {
  filter: brightness(1.06);
}

.dlg-enter-active,
.dlg-leave-active {
  transition: opacity 120ms var(--ease);
}
.dlg-enter-active .dialog,
.dlg-leave-active .dialog {
  transition: transform 180ms var(--ease-out), opacity 120ms var(--ease);
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
.dlg-enter-from .dialog,
.dlg-leave-to .dialog {
  opacity: 0;
  transform: scale(0.98) translateY(4px);
}
</style>
