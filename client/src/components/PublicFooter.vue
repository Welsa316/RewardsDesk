<script setup>
import { RouterLink } from 'vue-router';

// Every public page carries the same franchise disclaimer. Keeping it in one
// component means the wording can only ever be changed in one place.
defineProps({
  // The parking pages are white-label and deliberately show no hotel identity,
  // so they take the disclaimer without the policy links reading as chrome.
  compact: { type: Boolean, default: false },
});
</script>

<template>
  <footer class="mt-12 border-t border-sand pt-6 text-center">
    <nav v-if="!compact" class="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
      <RouterLink to="/sms" class="text-slate-warm hover:text-ink hover:underline">Text service</RouterLink>
      <RouterLink to="/privacy" class="text-slate-warm hover:text-ink hover:underline">Privacy</RouterLink>
      <RouterLink to="/terms" class="text-slate-warm hover:text-ink hover:underline">Terms</RouterLink>
    </nav>
    <p class="text-xs leading-relaxed text-slate-warm">
      Each BWH Hotels branded hotel is independently owned and operated.
    </p>
  </footer>
</template>
