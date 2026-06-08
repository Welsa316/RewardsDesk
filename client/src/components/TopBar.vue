<script setup>
defineProps({ title: { type: String, default: 'RewardsDesk' } });
defineEmits(['toggle']);
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-3 border-b border-sand bg-warm/85 px-4 py-3 backdrop-blur lg:hidden"
  >
    <button
      type="button"
      class="rounded-lg p-2 text-ink hover:bg-sand/60"
      aria-label="Open menu"
      @click="$emit('toggle')"
    >
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <span class="font-serif text-lg text-ink">{{ title }}</span>
  </header>
</template>
