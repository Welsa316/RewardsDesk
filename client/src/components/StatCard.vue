<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  goal: { type: Number, default: null },
  hint: { type: String, default: '' },
});

const pct = computed(() =>
  props.goal ? Math.min(100, Math.round((Number(props.value) / props.goal) * 100)) : null,
);
</script>

<template>
  <div class="card p-5">
    <p class="text-sm font-medium text-slate-warm">{{ label }}</p>
    <div class="mt-1 flex items-baseline gap-1.5">
      <span class="font-serif text-3xl text-ink">{{ value }}</span>
      <span v-if="goal" class="text-sm text-slate-warm">/ {{ goal }}</span>
    </div>
    <div v-if="pct !== null" class="mt-3">
      <div class="h-2 w-full overflow-hidden rounded-full bg-sand">
        <div class="h-full rounded-full bg-terracotta transition-all duration-500" :style="{ width: pct + '%' }" />
      </div>
      <p class="mt-1.5 text-xs text-slate-warm">{{ pct }}% of goal</p>
    </div>
    <p v-else-if="hint" class="mt-2 text-xs text-slate-warm">{{ hint }}</p>
  </div>
</template>
