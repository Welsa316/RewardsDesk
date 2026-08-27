<script setup>
// Public SMS opt-in disclosure. Carriers and Twilio's toll-free verification
// reviewers need to reach this without logging in, and need to see the exact
// call-to-action a guest sees in the lot alongside the consent language.
import { ref } from 'vue';
import PublicFooter from '../components/PublicFooter.vue';

const CONTACT_EMAIL = 'aks1321@gmail.com';
const signMissing = ref(false);
// Bound rather than literal: files in public/ are served as-is at runtime, and
// a literal src would make the build fail until the image is dropped in.
const SIGN_IMAGE = '/sign.png';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-warm">
    <header class="bg-ink px-5 py-8 text-center">
      <h1 class="font-serif text-2xl text-white">Pay to Park text service</h1>
      <p class="mt-2 text-sm text-white/70">SMS program terms and consent</p>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
      <div class="card p-6">
        <h2 class="font-serif text-xl text-ink">How it works</h2>
        <p class="mt-2 text-base leading-relaxed text-ink">
          Text <strong>PARK</strong> to
          <a href="tel:+18443147275" class="font-semibold text-terracotta-700 hover:underline">(844) 314-7275</a>
          to receive a one-time link to pay for parking.
        </p>

        <h2 class="mt-6 font-serif text-xl text-ink">Consent and message terms</h2>
        <p class="mt-2 text-base leading-relaxed text-ink">
          By texting PARK you consent to receive a single reply with a payment link. Message
          frequency: one message per request. Message and data rates may apply. Reply STOP to opt
          out, HELP for help.
        </p>

        <dl class="mt-6 grid gap-3 border-t border-sand pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt class="font-medium text-slate-warm">Program name</dt>
            <dd class="text-ink">Pay to Park text service</dd>
          </div>
          <div>
            <dt class="font-medium text-slate-warm">Message frequency</dt>
            <dd class="text-ink">One message per request</dd>
          </div>
          <div>
            <dt class="font-medium text-slate-warm">Opt out</dt>
            <dd class="text-ink">Reply STOP at any time</dd>
          </div>
          <div>
            <dt class="font-medium text-slate-warm">Help</dt>
            <dd class="text-ink">
              Reply HELP, or email
              <a :href="`mailto:${CONTACT_EMAIL}`" class="text-terracotta-700 hover:underline">{{ CONTACT_EMAIL }}</a>
            </dd>
          </div>
        </dl>

        <p class="mt-6 border-t border-sand pt-6 text-sm text-slate-warm">
          We never send marketing messages through this number, and we do not sell or share your
          phone number. It is used only to send you the payment link you asked for, and to look up
          an existing parking session so we can send you back to it.
        </p>
      </div>

      <section class="mt-6 card p-6">
        <h2 class="font-serif text-xl text-ink">Where guests see this</h2>
        <p class="mt-1 text-sm text-slate-warm">
          The sign posted in the parking area, showing the call to action guests respond to.
        </p>
        <figure class="mt-4">
          <img
            v-if="!signMissing"
            :src="SIGN_IMAGE"
            alt="Parking sign reading: Pay to Park. Scan to pay, with a QR code. Or text PARK to 844-314-PARK (844) 314-7275. Message and data rates may apply."
            class="mx-auto w-full max-w-xs rounded-xl border border-sand bg-white"
            @error="signMissing = true"
          />
          <p
            v-else
            class="rounded-xl border border-dashed border-sand bg-white/60 px-4 py-10 text-center text-sm text-slate-warm"
          >
            Sign image not uploaded yet — add it at <code>client/public/sign.png</code>.
          </p>
        </figure>
      </section>

      <PublicFooter />
    </main>
  </div>
</template>
