<script setup>
// Public landing page. Most visits come from a phone standing in the parking
// lot, so paying for parking is the primary action — it gets the larger card,
// the filled button and the brand colour, with rewards clearly secondary.
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { parkingPublic } from '../api';
import PublicFooter from '../components/PublicFooter.vue';
import PromoStrip from '../components/PromoStrip.vue';

const CONTACT_EMAIL = 'aks1321@gmail.com';
const CONTACT_PHONE_DISPLAY = '(504) 360-2990';
const CONTACT_PHONE_TEL = '+15043602990';

// Served from public/ at runtime; falls back to the text wordmark if absent so
// the header is never broken while the file is being added or swapped.
const LOGO = '/logo.png';
const logoMissing = ref(false);

const brand = ref('MSY Best Parking');

onMounted(async () => {
  try {
    const { data } = await parkingPublic.config();
    if (data?.brand_name) brand.value = data.brand_name;
  } catch {
    // Keep the default; the page is still fully usable.
  }
});
</script>

<template>
  <div class="flex min-h-screen flex-col bg-warm">
    <header
      class="sticky top-0 z-40 flex items-center gap-3 border-b border-sand/70 bg-warm/90 px-5 py-3.5 backdrop-blur-sm md:px-10"
    >
      <img
        v-if="!logoMissing"
        :src="LOGO"
        :alt="brand"
        class="h-11 w-auto md:h-14"
        @error="logoMissing = true"
      />
      <span v-else class="font-serif text-lg text-maroon md:text-xl">{{ brand }}</span>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-10 md:py-12">
      <PromoStrip />

      <div class="grid grid-cols-1 gap-4 md:grid-cols-12">
        <RouterLink
          to="/park"
          class="group relative flex flex-col overflow-hidden rounded-3xl border border-sand bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-maroon/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon/40 md:col-span-8 md:p-10"
        >
          <div
            class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-maroon/5 blur-3xl transition-colors duration-500 group-hover:bg-maroon/10"
          />
          <span
            class="relative z-10 mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-maroon text-white"
            aria-hidden="true"
          >
            <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 17h14M5 17a2 2 0 0 1-2-2v-3l2-5h14l2 5v3a2 2 0 0 1-2 2M5 17v2M19 17v2M7 12h.01M17 12h.01" />
            </svg>
          </span>
          <div class="relative z-10 max-w-lg">
            <h2 class="font-serif text-3xl leading-tight text-ink md:text-4xl">Pay for Parking</h2>
            <p class="mt-3 text-base leading-relaxed text-slate-warm md:text-lg">
              Enter your plate, choose how many days you're staying, and pay by card. You'll get a
              link to check your time or add more.
            </p>
          </div>
          <span
            class="relative z-10 mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-maroon px-7 py-3.5 text-base font-semibold text-white shadow-sm transition group-hover:bg-maroon-700 md:w-auto md:self-start"
          >
            Start
            <svg class="h-5 w-5 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </RouterLink>

        <RouterLink
          to="/enroll"
          class="group relative flex flex-col overflow-hidden rounded-3xl border border-sand bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-ink/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 md:col-span-4"
        >
          <div
            class="pointer-events-none absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-ink/5 blur-2xl transition-colors duration-500 group-hover:bg-ink/10"
          />
          <span
            class="relative z-10 mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white"
            aria-hidden="true"
          >
            <svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9z" />
            </svg>
          </span>
          <div class="relative z-10">
            <h2 class="font-serif text-2xl text-ink">Rewards Enrollment</h2>
            <p class="mt-2 text-base leading-relaxed text-slate-warm">
              Sign up for the hotel's loyalty program. Fill in your details here and the front desk
              finishes it at check-in.
            </p>
          </div>
          <span
            class="relative z-10 mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-ink px-5 py-3 text-base font-semibold text-ink transition group-hover:bg-ink group-hover:text-white"
          >
            Enroll
            <svg class="h-5 w-5 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </RouterLink>

        <section
          class="flex flex-col items-center justify-between gap-4 rounded-2xl border border-sand bg-white/70 p-6 text-center md:col-span-12 md:flex-row md:text-left"
        >
          <div class="flex items-center gap-4">
            <span
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-warm text-maroon"
              aria-hidden="true"
            >
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="9" />
                <path stroke-linecap="round" d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5" />
                <path stroke-linecap="round" d="M12 16.5h.01" />
              </svg>
            </span>
            <div>
              <h2 class="font-serif text-xl text-ink">Need help?</h2>
              <p class="mt-0.5 text-sm text-slate-warm">
                Call or email and someone at the front desk will sort it out.
              </p>
            </div>
          </div>
          <div class="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <a :href="`tel:${CONTACT_PHONE_TEL}`" class="btn btn-secondary whitespace-nowrap">
              {{ CONTACT_PHONE_DISPLAY }}
            </a>
            <a
              :href="`mailto:${CONTACT_EMAIL}`"
              class="btn whitespace-nowrap border border-sand bg-white text-ink hover:bg-sand/50"
            >
              Email us
            </a>
          </div>
        </section>
      </div>

      <PublicFooter />
    </main>
  </div>
</template>
