<script setup>
import { RouterLink } from 'vue-router';

// Every public page carries the policy links. Keeping them in one component
// means the wording can only ever be changed in one place.
defineProps({
  // The parking pages are deliberately white-label: a guest paying to park must
  // not be able to connect the product to the hotel chain, so they omit the
  // franchise disclaimer. They still need Terms and Privacy — they are the
  // pages that take a card and a phone number.
  //
  // (The old `compact` prop did the opposite: it hid the policy links and kept
  // the disclaimer, which named the chain on the one surface that must not name
  // it. It was never passed by anything, so nothing depended on that behaviour.)
  whiteLabel: { type: Boolean, default: false },
});
</script>

<template>
  <!-- A translucent panel rather than bare text. The home page puts this over
       the skyline illustration, where plain slate type on a busy mid-tone
       image is genuinely hard to read; on the flat-background pages the panel
       is close to invisible. Same component either way, legible on both. -->
  <footer class="mt-12 rounded-2xl bg-white/65 px-4 py-5 text-center backdrop-blur-md">
    <!-- py-3 gives these a 44px touch height. They were 20px, which is under
         the minimum and genuinely hard to hit one-handed in a parking lot. -->
    <nav class="flex flex-wrap justify-center gap-x-3 text-sm" :class="whiteLabel ? '' : 'mb-2'">
      <RouterLink to="/sms" class="px-2 py-3 font-medium text-ink/85 hover:text-ink hover:underline">Text service</RouterLink>
      <RouterLink to="/terms" class="px-2 py-3 font-medium text-ink/85 hover:text-ink hover:underline">Terms of Service</RouterLink>
      <RouterLink to="/privacy" class="px-2 py-3 font-medium text-ink/85 hover:text-ink hover:underline">Privacy Policy</RouterLink>
    </nav>
    <p v-if="!whiteLabel" class="text-xs leading-relaxed text-ink/85">
      Each BWH Hotels branded hotel is independently owned and operated.
    </p>
  </footer>
</template>
