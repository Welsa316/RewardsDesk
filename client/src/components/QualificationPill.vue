<script setup>
defineProps({ qualification: { type: String, default: null } });

const MAP = {
  qualified: { label: 'Qualified', cls: 'bg-green-100 text-green-800' },
  disqualified: { label: 'Disqualified', cls: 'bg-red-100 text-red-800' },
};
const UNREVIEWED = { label: 'Awaiting review', cls: 'bg-sand/70 text-slate-warm' };
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="(MAP[qualification] || UNREVIEWED).cls"
  >
    {{ (MAP[qualification] || UNREVIEWED).label }}
  </span>
</template>
