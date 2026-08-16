<script setup>
defineProps({ status: { type: String, default: 'active' } });

const MAP = {
  pending_payment: { label: 'Awaiting payment', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-800' },
  expiring_soon: { label: 'Expiring soon', cls: 'bg-amber-100 text-amber-800' },
  expired: { label: 'Expired', cls: 'bg-red-100 text-red-800' },
  departed: { label: 'Departed', cls: 'bg-slate-200 text-slate-700' },
  complimentary: { label: 'Complimentary', cls: 'bg-blue-100 text-blue-800' },
  canceled: { label: 'Canceled', cls: 'bg-gray-200 text-gray-600' },
};
</script>

<template>
  <span
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="(MAP[status] || MAP.active).cls"
  >
    {{ (MAP[status] || MAP.active).label }}
  </span>
</template>
