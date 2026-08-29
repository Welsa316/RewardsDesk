<script setup>
// Airport transport options, and the disclaimer that the hotel provides none.
//
// This is a liability statement as much as a courtesy: a guest who parks here
// assuming a shuttle exists and then misses a flight is a real problem. It is
// kept in one component so the wording can only ever be changed in one place,
// and so "hotel does not provide shuttle" can never drift out of sync between
// the home page and the parking page.
defineProps({
  // The parking page shows this below the form, where it is guidance. The home
  // page shows it as a standalone card.
  compact: { type: Boolean, default: false },
});

const STAR_CAB_TEL = '+15048341400';
</script>

<template>
  <section
    class="rounded-2xl border border-sand bg-white/70 p-5"
    :class="compact ? 'mt-6' : ''"
    aria-labelledby="shuttle-heading"
  >
    <h2 id="shuttle-heading" class="font-serif text-lg text-ink">Getting to the airport</h2>
    <p class="mt-1 text-sm leading-relaxed text-slate-warm">
      If you're heading to the airport, the following shuttle services are available for your own
      convenience. Please confirm rates directly with the service provider.
    </p>

    <div class="mt-4 rounded-xl border border-sand bg-warm/60 p-4">
      <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p class="font-semibold text-ink">Star Cab</p>
        <a
          :href="`tel:${STAR_CAB_TEL}`"
          class="font-semibold text-maroon-700 hover:underline"
        >
          504-834-1400
        </a>
      </div>
      <p class="mt-1 text-sm text-slate-warm">
        $18.00 one way for 2 adults. Rates vary based on demand.
      </p>
    </div>

    <p class="mt-3 text-sm text-slate-warm">
      Uber and Lyft also serve the airport from here.
    </p>

    <p class="mt-4 border-t border-sand pt-3 text-sm font-semibold uppercase tracking-wide text-ink">
      The hotel does not provide a shuttle
    </p>
  </section>
</template>
