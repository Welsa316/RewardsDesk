<script setup>
// Active promotional images, shown on the public home page and above the
// parking payment form. Renders nothing at all when there are none, so it can
// sit unconditionally in both layouts without leaving a gap.
import { ref, onMounted } from 'vue';
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

function show(i) {
  index.value = i;
}
</script>

<template>
  <section v-if="promos.length" class="mb-6" aria-label="Current offers">
    <!-- One promo: just the image. Several: a simple pager, no autoplay —
         a carousel that moves on its own steals attention from the form. -->
    <img
      :src="promos[index].image_url"
      :alt="promos[index].title"
      class="w-full rounded-2xl border border-sand bg-white object-cover"
    />
    <p class="mt-2 text-center text-sm font-medium text-ink">{{ promos[index].title }}</p>

    <div v-if="promos.length > 1" class="mt-3 flex justify-center gap-2">
      <button
        v-for="(p, i) in promos"
        :key="p.id"
        type="button"
        class="h-2.5 rounded-full transition"
        :class="i === index ? 'w-6 bg-ink' : 'w-2.5 bg-sand hover:bg-slate-warm/40'"
        :aria-label="`Show offer ${i + 1}: ${p.title}`"
        :aria-current="i === index"
        @click="show(i)"
      />
    </div>
  </section>
</template>
