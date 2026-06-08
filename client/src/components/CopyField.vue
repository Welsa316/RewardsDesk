<script setup>
import { ref } from 'vue';
import { copyText } from '../utils/clipboard';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
});

const copied = ref(false);

async function copy() {
  if (!props.value) return;
  const ok = await copyText(String(props.value));
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  }
}
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-center justify-between gap-3 rounded-xl border border-sand bg-warm/40 px-4 py-2.5 text-left transition hover:border-terracotta/40 hover:bg-warm disabled:cursor-not-allowed disabled:opacity-50"
    :disabled="!value"
    @click="copy"
  >
    <span class="min-w-0">
      <span class="block text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">{{ label }}</span>
      <span class="block truncate text-ink">{{ value || '—' }}</span>
    </span>
    <span class="shrink-0 text-xs font-semibold" :class="copied ? 'text-green-600' : 'text-terracotta'">
      {{ copied ? 'Copied' : 'Copy' }}
    </span>
  </button>
</template>
