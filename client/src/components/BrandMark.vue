<script setup>
// Plain text wordmark. This deliberately carries no hotel logo or brand imagery
// — the property's marks are not ours to display on this site, and nothing
// guest-facing should identify the hotel chain.
defineProps({
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  // What the mark should read. Callers on public pages pass the configured
  // parking brand so the guest never sees an internal product name.
  label: { type: String, default: 'RewardsDesk' },
});

const SIZES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
};
</script>

<template>
  <span
    class="inline-block font-serif font-semibold tracking-tight text-ink"
    :class="SIZES[size] || SIZES.md"
  >
    {{ label }}
  </span>
</template>
