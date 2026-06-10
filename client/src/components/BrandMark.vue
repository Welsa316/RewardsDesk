<script setup>
import bwLogo from '../assets/bw-logo.png';

defineProps({
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
});

const HEIGHTS = { sm: 'h-8', md: 'h-11', lg: 'h-14' };
</script>

<template>
  <img
    :src="bwLogo"
    alt="Best Western Hotels & Resorts"
    class="inline-block w-auto"
    :class="HEIGHTS[size] || HEIGHTS.md"
  />
</template>
