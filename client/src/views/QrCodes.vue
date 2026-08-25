<script setup>
import { ref, computed, onMounted } from 'vue';
import { settings as api } from '../api';
import QrCard from '../components/QrCard.vue';
import PrefillLinkBuilder from '../components/PrefillLinkBuilder.vue';

const sources = ref([]);
const lots = ref([]);
const loading = ref(true);
const loadError = ref('');
// These URLs get PRINTED and stuck to a wall, so they must be the canonical
// domain — not whatever host the admin happened to open the page from. A sign
// generated from localhost or a preview URL is dead the moment it is mounted.
const baseUrl = ref(window.location.origin);
const originMismatch = ref(false);

// Platform-generated hostnames are fine to develop against and a trap to print:
// they carry the service's name (so a parking sign would show "rewardsdesk" in
// the guest's address bar), and they are not yours to keep.
const TEMPORARY_HOSTS = /(^https?:\/\/localhost)|(\.up\.railway\.app)|(\.railway\.app)|(\.vercel\.app)|(\.onrender\.com)|(\.netlify\.app)|(\.fly\.dev)|(\d+\.\d+\.\d+\.\d+)/i;
const baseUrlIsTemporary = computed(() => TEMPORARY_HOSTS.test(baseUrl.value));
const currentOrigin = window.location.origin;

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get();
    sources.value = data.sources || [];
    lots.value = data.parking_lots || [];
    if (data.public_base_url) {
      baseUrl.value = data.public_base_url.replace(/\/+$/, '');
      originMismatch.value = baseUrl.value !== window.location.origin;
    }
  } catch {
    loadError.value = 'Could not load sources.';
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <h1 class="font-serif text-2xl text-ink">QR codes &amp; links</h1>
    <p class="text-sm text-slate-warm">
      Generic codes to print, and a prefilled-link builder for per-guest messages.
    </p>

    <p class="mt-3 text-sm text-slate-warm">
      These codes point at <span class="font-medium text-ink">{{ baseUrl }}</span>.
    </p>
    <div
      v-if="baseUrlIsTemporary"
      role="alert"
      class="mt-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p class="font-semibold">Don't print these yet.</p>
      <p class="mt-1">
        These codes point at <strong>{{ baseUrl }}</strong>, which is a temporary hosting address.
        Two problems: it isn't yours to keep, and a guest who looks at their address bar after
        scanning will see the app's name — which defeats the point of the white-label parking pages.
      </p>
      <p class="mt-1">
        Add your own domain, set <code>PUBLIC_BASE_URL</code> to it, redeploy, then print. Signs
        already printed against an old address keep working as long as you leave the old domain
        attached.
      </p>
    </div>

    <div
      v-else-if="originMismatch"
      role="alert"
      class="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      You're viewing this from <strong>{{ currentOrigin }}</strong>, but the codes are being built
      for <strong>{{ baseUrl }}</strong> (the configured <code>PUBLIC_BASE_URL</code>). That's the
      address that will be printed — check it's the one guests should reach before printing.
    </div>

    <section class="mt-6">
      <h2 class="font-serif text-lg text-ink">Printable QR codes</h2>
      <p class="mb-4 text-sm text-slate-warm">
        Each opens the enroll form tagged with its source. Safe to print — they hold no personal data.
      </p>
      <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-72 animate-pulse rounded-2xl border border-sand bg-white/60" />
      </div>
      <div v-else-if="loadError" class="card p-6 text-center">
        <p class="text-slate-warm">{{ loadError }}</p>
        <button class="btn btn-secondary mt-4" @click="load">Retry</button>
      </div>
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QrCard v-for="s in sources" :key="s" :source="s" :base-url="baseUrl" />
      </div>
    </section>

    <section class="mt-8">
      <h2 class="font-serif text-lg text-ink">Parking signs</h2>
      <p class="mb-4 text-sm text-slate-warm">
        White-label parking QR codes — one per lot, tagging where the guest scanned. Safe to print.
      </p>
      <div v-if="!loading && lots.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QrCard
          v-for="l in lots"
          :key="`park-${l}`"
          :source="l"
          :base-url="baseUrl"
          :link="`${baseUrl}/park?src=${encodeURIComponent(l)}`"
          :label="`Parking — ${l}`"
          :filename="`parking-${l}.png`"
        />
      </div>
      <p v-else-if="!loading" class="text-sm text-slate-warm">
        No lots configured yet — add them in Parking settings.
      </p>
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
