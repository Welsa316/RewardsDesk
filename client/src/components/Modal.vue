<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { focusFirst, trapTabKey } from '../utils/focusTrap';

defineProps({ title: { type: String, default: '' } });
const emit = defineEmits(['close']);

let uid = 0;
const titleId = `modal-title-${++uid}-${Date.now() % 100000}`;
const panel = ref(null);

let previouslyFocused = null;
let prevBodyOverflow = '';

function onKey(e) {
  if (e.key === 'Escape') {
    emit('close');
    return;
  }
  trapTabKey(panel.value, e);
}

onMounted(async () => {
  previouslyFocused = document.activeElement;
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  await nextTick();
  focusFirst(panel.value);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.body.style.overflow = prevBodyOverflow;
  previouslyFocused?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-ink/40" @click="emit('close')" />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div class="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 :id="titleId" class="font-serif text-xl text-ink">{{ title }}</h2>
          <button
            type="button"
            class="rounded-lg p-1.5 text-slate-warm hover:bg-sand/60 hover:text-ink"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
        <div class="overflow-y-auto p-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
