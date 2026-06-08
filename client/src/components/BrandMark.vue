<script setup>
defineProps({
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
});
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-xl bg-ink"
    :class="{ 'h-9 w-9': size === 'sm', 'h-12 w-12': size === 'md', 'h-16 w-16': size === 'lg' }"
  >
    <span
      class="font-serif font-semibold text-terracotta"
      :class="{ 'text-lg': size === 'sm', 'text-2xl': size === 'md', 'text-3xl': size === 'lg' }"
    >
      R
    </span>
  </span>
</template>
