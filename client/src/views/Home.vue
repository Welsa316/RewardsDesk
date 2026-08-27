<script setup>
// Public landing page. Most visits come from a phone standing in the parking
// lot, so paying for parking is the primary action and everything is reachable
// without scrolling on a small screen.
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { parkingPublic } from '../api';
import PublicFooter from '../components/PublicFooter.vue';
import PromoStrip from '../components/PromoStrip.vue';

const CONTACT_EMAIL = 'aks1321@gmail.com';
const CONTACT_PHONE_DISPLAY = '(504) 360-2990';
const CONTACT_PHONE_TEL = '+15043602990';

// Admin-configurable, and carries no hotel identity — the same value the
// parking pages use as their wordmark.
const brand = ref('Guest Parking');

onMounted(async () => {
  try {
    const { data } = await parkingPublic.config();
    if (data?.brand_name) brand.value = data.brand_name;
  } catch {
    // Keep the neutral default; the page is still fully usable.
  }
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-warm">
    <header class="bg-ink px-5 py-8 text-center sm:py-10">
      <h1 class="font-serif text-2xl text-white sm:text-3xl">{{ brand }}</h1>
      <p class="mx-auto mt-2 max-w-md text-sm text-white/70">
        Pay for parking or join the rewards program — no app to download.
      </p>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <PromoStrip />

      <div class="grid gap-4 sm:grid-cols-2">
        <RouterLink
          to="/park"
          class="group flex flex-col rounded-2xl border border-sand bg-white p-6 shadow-sm transition hover:border-terracotta-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40"
        >
          <span
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-terracotta-600 text-white"
            aria-hidden="true"
          >
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 17h14M5 17a2 2 0 0 1-2-2v-3l2-5h14l2 5v3a2 2 0 0 1-2 2M5 17v2M19 17v2M7 12h.01M17 12h.01" />
            </svg>
          </span>
          <h2 class="font-serif text-xl text-ink">Pay for Parking</h2>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-slate-warm">
            Enter your plate, choose how long you're staying, and pay by card. You'll get a link to
            check your time or add more.
          </p>
          <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-terracotta-700">
            Start
            <svg class="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </RouterLink>

        <RouterLink
          to="/enroll"
          class="group flex flex-col rounded-2xl border border-sand bg-white p-6 shadow-sm transition hover:border-ink hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <span
            class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-white"
            aria-hidden="true"
          >
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9z" />
            </svg>
          </span>
          <h2 class="font-serif text-xl text-ink">Rewards Enrollment</h2>
          <p class="mt-1.5 flex-1 text-sm leading-relaxed text-slate-warm">
            Sign up for the hotel's loyalty program. Fill in your details here and the front desk
            finishes it at check-in.
          </p>
          <span class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
            Start
            <svg class="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </RouterLink>
      </div>

      <section class="mt-8 rounded-2xl border border-sand bg-white/60 p-6 text-center">
        <h2 class="font-serif text-lg text-ink">Need help?</h2>
        <p class="mt-1 text-sm text-slate-warm">Call or email us and someone at the desk will sort it out.</p>
        <div class="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center">
          <a :href="`tel:${CONTACT_PHONE_TEL}`" class="btn btn-secondary">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h1.6a1 1 0 0 1 .96.73l.85 3a1 1 0 0 1-.28 1l-1.2 1.15a12.5 12.5 0 0 0 5.69 5.69l1.15-1.2a1 1 0 0 1 1-.28l3 .85a1 1 0 0 1 .73.96v1.6A2.5 2.5 0 0 1 18.5 21C10.49 21 3 13.51 3 5.5z" />
            </svg>
            {{ CONTACT_PHONE_DISPLAY }}
          </a>
          <a :href="`mailto:${CONTACT_EMAIL}`" class="btn border border-sand bg-white text-ink hover:bg-sand/50">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5zM3.5 7l8.5 6 8.5-6" />
            </svg>
            {{ CONTACT_EMAIL }}
          </a>
        </div>
      </section>

      <PublicFooter />
    </main>
  </div>
</template>
