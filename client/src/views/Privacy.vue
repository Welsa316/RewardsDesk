<script setup>
import { RouterLink } from 'vue-router';
import PublicFooter from '../components/PublicFooter.vue';

const CONTACT_EMAIL = 'aks1321@gmail.com';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-warm">
    <header class="bg-ink px-5 py-8 text-center">
      <h1 class="font-serif text-2xl text-white">Privacy Policy</h1>
      <p class="mt-2 text-sm text-white/70">MSY Best Parking</p>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
      <article class="card space-y-5 p-6 text-base leading-relaxed text-ink">
        <section>
          <h2 class="font-serif text-lg">What we collect</h2>
          <p class="mt-1.5 text-slate-warm">
            When you pay for parking we collect your name, phone number, licence plate, and
            optionally your room number, vehicle description, and email address. When you sign up
            for the rewards program we collect your name and the contact details you enter, which
            may include an email address, phone number, and mailing address.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Payment information</h2>
          <p class="mt-1.5 text-slate-warm">
            Card payments are processed by Stripe. Your card number never reaches our servers and we
            never store it. We keep only Stripe's reference identifiers, the amount, and the receipt
            link, so we can look up a payment or issue a refund.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Text messages</h2>
          <p class="mt-1.5 text-slate-warm">
            If you text PARK to our number, we use your phone number to send you one automated
            message per request containing a payment link, and to look up an existing parking
            session so we can send you back to it. Message frequency: 1 message per request. We do
            not send marketing texts and we never share your number with anyone for marketing.
            Reply STOP at any time to opt out, HELP for help. Full program terms are on the
            <RouterLink to="/sms" class="font-medium text-terracotta-700 hover:underline">text service page</RouterLink>.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">How we use it</h2>
          <p class="mt-1.5 text-slate-warm">
            Parking details are used to run the parking operation: confirming what you paid for,
            showing you time remaining, and identifying vehicles on the lot. Rewards details are
            used to complete your enrolment at the front desk. That is all.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">We do not sell your data</h2>
          <p class="mt-1.5 text-slate-warm">
            We do not sell, rent, or trade your personal information. We share it only with the
            service providers that make this work — Stripe for payments and our messaging provider
            for texts — and where the law requires it.
          </p>
        </section>

        <section>
          <h2 class="font-serif text-lg">Keeping and removing it</h2>
          <p class="mt-1.5 text-slate-warm">
            We keep records only as long as we need them for operations, accounting, and tax. To ask
            what we hold about you or to have it deleted, email
            <a :href="`mailto:${CONTACT_EMAIL}`" class="font-medium text-terracotta-700 hover:underline">{{ CONTACT_EMAIL }}</a>.
          </p>
        </section>
      </article>

      <PublicFooter />
    </main>
  </div>
</template>
