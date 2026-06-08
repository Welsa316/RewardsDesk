<script setup>
import { ref } from 'vue';
import { copyText } from '../utils/clipboard';
import { copyAllBlock } from '../utils/format';

const props = defineProps({ enrollment: { type: Object, required: true } });
const copied = ref(false);

async function copyAll() {
  const ok = await copyText(copyAllBlock(props.enrollment));
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  }
}
</script>

<template>
  <button type="button" class="btn btn-secondary w-full" @click="copyAll">
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
    {{ copied ? 'Copied all fields' : 'Copy all' }}
  </button>
</template>
