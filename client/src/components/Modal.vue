<script setup>
import { onMounted, onBeforeUnmount } from 'vue';

defineProps({ title: { type: String, default: '' } });
const emit = defineEmits(['close']);

function onKey(e) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div class="absolute inset-0 bg-ink/40" @click="emit('close')" />
      <div
        class="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div class="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 class="font-serif text-xl text-ink">{{ title }}</h2>
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
