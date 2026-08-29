<script setup>
// Active promotional images, shown on every public page. Renders nothing at
// all when there are none, so it can sit unconditionally in each layout
// without leaving a gap.
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { promosPublic } from '../api';

const promos = ref([]);
const index = ref(0);

onMounted(async () => {
  try {
    const { data } = await promosPublic.active();
    promos.value = data.promos || [];
  } catch {
    // A promo is decoration; never let it break the page it sits on.
  }
});

// Whitelisted on the server too; this just turns the stored value into a route.
const LINKS = { enroll: '/enroll', park: '/park' };
function destination(promo) {
  return LINKS[promo?.link_to] || null;
}

function show(i) {
  index.value = i;
}
</script>

<template>
  <section v-if="promos.length" class="mb-6" aria-label="Current offers">
    <!-- One promo: just the image. Several: a simple pager, no autoplay —
         a carousel that moves on its own steals attention from the form. -->
    <!-- The title is an internal label for the admin list, not guest copy, so
         it is never printed under the image. It stays as the alt text: the
         image carries the whole offer, and without it a screen reader would
         announce nothing at all. -->
    <!-- Clickable only when the admin gave it a destination. The image usually
         carries its own "register now", so the whole thing is the target. -->
    <RouterLink
      v-if="destination(promos[index])"
      :to="destination(promos[index])"
      class="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/40"
    >
      <img
        :src="promos[index].image_url"
        :alt="promos[index].title"
        class="w-full rounded-2xl border border-sand bg-white object-cover transition hover:border-maroon/40"
      />
    </RouterLink>
    <img
      v-else
      :src="promos[index].image_url"
      :alt="promos[index].title"
      class="w-full rounded-2xl border border-sand bg-white object-cover"
    />

    <div v-if="promos.length > 1" class="mt-3 flex justify-center gap-2">
      <button
        v-for="(p, i) in promos"
        :key="p.id"
        type="button"
        class="h-2.5 rounded-full transition"
        :class="i === index ? 'w-6 bg-ink' : 'w-2.5 bg-sand hover:bg-slate-warm/40'"
        :aria-label="`Show offer ${i + 1} of ${promos.length}`"
        :aria-current="i === index"
        @click="show(i)"
      />
    </div>
  </section>
</template>
