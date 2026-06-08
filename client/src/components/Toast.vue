<script setup>
import { useToastStore } from '../stores/toast';

const toasts = useToastStore();

function runAction(t) {
  t.action?.onClick?.();
  toasts.dismiss(t.id);
}

function toneClass(type) {
  if (type === 'error') return 'bg-red-600 text-white';
  if (type === 'success') return 'bg-ink text-white';
  return 'bg-ink text-white';
}
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts.toasts"
          :key="t.id"
          class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl px-4 py-3 shadow-lg"
          :class="toneClass(t.type)"
          role="status"
        >
          <span class="flex-1 text-sm">{{ t.message }}</span>
          <button
            v-if="t.action"
            type="button"
            class="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-terracotta hover:bg-white/10"
            @click="runAction(t)"
          >
            {{ t.action.label }}
          </button>
          <button
            type="button"
            class="shrink-0 text-white/60 hover:text-white"
            aria-label="Dismiss"
            @click="toasts.dismiss(t.id)"
          >
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(0.75rem);
}
</style>
