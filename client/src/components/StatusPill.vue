<script setup>
defineProps({ status: { type: String, default: 'pending' } });

const MAP = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  enrolled: { label: 'Enrolled', cls: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', cls: 'bg-slate-200 text-slate-700' },
  already_member: { label: 'Already a member', cls: 'bg-blue-100 text-blue-800' },
  duplicate: { label: 'Duplicate', cls: 'bg-gray-200 text-gray-600' },
};
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="(MAP[status] || MAP.pending).cls"
  >
    {{ (MAP[status] || MAP.pending).label }}
  </span>
</template>
