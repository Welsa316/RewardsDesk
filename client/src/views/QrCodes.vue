<script setup>
import { ref, onMounted } from 'vue';
import { settings as api } from '../api';
import QrCard from '../components/QrCard.vue';
import PrefillLinkBuilder from '../components/PrefillLinkBuilder.vue';

const sources = ref([]);
const loading = ref(true);
const baseUrl = window.location.origin;

onMounted(async () => {
  try {
    const { data } = await api.get();
    sources.value = data.sources || [];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <h1 class="font-serif text-2xl text-ink">QR codes &amp; links</h1>
    <p class="text-sm text-slate-warm">
      Generic codes to print, and a prefilled-link builder for per-guest messages.
    </p>

    <section class="mt-6">
      <h2 class="font-serif text-lg text-ink">Printable QR codes</h2>
      <p class="mb-4 text-sm text-slate-warm">
        Each opens the enroll form tagged with its source. Safe to print — they hold no personal data.
      </p>
      <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-72 animate-pulse rounded-2xl border border-sand bg-white/60" />
      </div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QrCard v-for="s in sources" :key="s" :source="s" :base-url="baseUrl" />
      </div>
    </section>

    <section class="mt-8">
      <h2 class="font-serif text-lg text-ink">Prefilled link builder</h2>
      <p class="mb-4 text-sm text-slate-warm">
        Build a ready-to-send link for a specific guest (e.g. via Canary).
      </p>
      <PrefillLinkBuilder :base-url="baseUrl" :sources="sources" />
    </section>
  </div>
</template>
