<script setup>
import { RouterLink } from 'vue-router';
import PublicFooter from '../components/PublicFooter.vue';

const CONTACT_EMAIL = 'aks1321@gmail.com';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-warm">
    <header class="bg-ink px-5 py-8 text-center">
      <h1 class="font-serif text-2xl text-white">Terms of Service</h1>
      <p class="mt-2 text-sm text-white/70">MSY Best Parking</p>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
      <article class="card space-y-5 p-6 text-base leading-relaxed text-ink">
        <section>
          <h2 class="font-serif text-lg">Paying for parking</h2>
          <p class="mt-1.5 text-slate-warm">
            Parking is sold by the day at the rate shown when you pay. Your session starts when you
            pay and runs until the end time shown on your confirmation page. Rates in effect at the
            time of purchase apply; a later rate change does not alter a session you have already
            paid for.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Your responsibility</h2>
          <p class="mt-1.5 text-slate-warm">
            Enter your licence plate correctly — it is how your vehicle is identified on the lot. A
            vehicle parked without a valid paid session, or left past its paid-through time, may be
            subject to additional charges, towing, or removal at the owner's expense. Add time
            before your session expires using the link on your confirmation page.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Refunds</h2>
          <p class="mt-1.5 text-slate-warm">
            Refunds are handled at the front desk. If a payment was taken in error, contact us and
            we will refund it to the original card. Refunds may take several business days to appear
            on your statement.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Text messages</h2>
          <p class="mt-1.5 text-slate-warm">
            Texting PARK to our number returns one automated message per request containing a
            payment link. Message frequency: 1 message per request. Message and data rates may
            apply. Reply STOP to opt out, HELP for help. See the
            <RouterLink to="/sms" class="font-medium text-maroon-700 hover:underline">text service page</RouterLink>
            for the full program terms.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Rewards enrolment</h2>
          <p class="mt-1.5 text-slate-warm">
            The enrolment form collects your details so the front desk can complete your loyalty
            programme sign-up at check-in. Membership itself is governed by the loyalty programme's
            own terms, not by these.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Liability</h2>
          <p class="mt-1.5 text-slate-warm">
            Parking is at your own risk. We are not responsible for theft of or damage to vehicles
            or their contents. Paying for parking does not create a bailment.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Contact</h2>
          <p class="mt-1.5 text-slate-warm">
            Questions about these terms:
            <a :href="`mailto:${CONTACT_EMAIL}`" class="font-medium text-maroon-700 hover:underline">{{ CONTACT_EMAIL }}</a>.
            We may update these terms; the version on this page is the one in effect.
          </p>
        </section>
      </article>

      <PublicFooter />
    </main>
  </div>
</template>
