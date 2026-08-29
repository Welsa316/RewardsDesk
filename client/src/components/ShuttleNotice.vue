<script setup>
// Airport transport for guests who parked here and still need to get to the
// terminal. Presented as a service rather than fine print — it is genuinely
// useful, and a guest who does not find it ends up at the desk asking.
//
// The dark ground is deliberate: on a page of light glass cards this is the one
// band with weight, which is what makes it findable. Elevation on a dark
// surface comes from stepped fills and hairlines, not shadows.
//
// The "no shuttle" line stays in the same component as the options so the two
// can never drift apart — it is a liability statement, and a guest who assumes
// a shuttle exists and misses a flight is a real problem.
defineProps({
  compact: { type: Boolean, default: false },
});

const STAR_CAB_TEL = '+15048341400';
</script>

<template>
  <section
    class="overflow-hidden rounded-2xl bg-ink text-white"
    :class="compact ? 'mt-6' : ''"
    aria-labelledby="shuttle-heading"
  >
    <div class="p-6 md:p-7">
      <div class="flex items-start gap-4">
        <span
          class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-maroon-300"
          aria-hidden="true"
        >
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 16h14M5 16a2 2 0 0 1-2-2v-2.5L4.6 7A2 2 0 0 1 6.5 5.5h11A2 2 0 0 1 19.4 7L21 11.5V14a2 2 0 0 1-2 2M5 16v2M19 16v2M7 11.5h.01M17 11.5h.01M9 5.5V4h6v1.5" />
          </svg>
        </span>
        <div class="min-w-0">
          <h2 id="shuttle-heading" class="font-serif text-xl text-white md:text-2xl">
            Need a ride to the airport?
          </h2>
          <p class="mt-1.5 text-sm leading-relaxed text-white/70">
            These services run from here. Confirm rates directly with the provider.
          </p>
        </div>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <!-- Star Cab has a fixed price, so it leads and carries the call button -->
        <div class="rounded-xl bg-white/[0.07] p-4 ring-1 ring-white/10">
          <p class="font-semibold text-white">Star Cab</p>
          <p class="mt-0.5 text-sm text-white/70">$18.00 one way for 2 adults</p>
          <a
            :href="`tel:${STAR_CAB_TEL}`"
            class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:bg-maroon-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h1.6a1 1 0 0 1 .96.73l.85 3a1 1 0 0 1-.28 1l-1.2 1.15a12.5 12.5 0 0 0 5.69 5.69l1.15-1.2a1 1 0 0 1 1-.28l3 .85a1 1 0 0 1 .73.96v1.6A2.5 2.5 0 0 1 18.5 21C10.49 21 3 13.51 3 5.5z" />
            </svg>
            Call 504-834-1400
          </a>
        </div>

        <div class="rounded-xl bg-white/[0.07] p-4 ring-1 ring-white/10">
          <p class="font-semibold text-white">Uber or Lyft</p>
          <p class="mt-0.5 text-sm text-white/70">Rates vary based on demand</p>
          <p class="mt-3 text-sm text-white/50">Book in your own app.</p>
        </div>
      </div>
    </div>

    <p class="border-t border-white/10 bg-white/[0.04] px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-white/80 md:px-7">
      The hotel does not provide a shuttle
    </p>
  </section>
</template>
