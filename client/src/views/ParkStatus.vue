<script setup>
// Guest parking status page (white-label, tokenized URL — no login).
// Shows time remaining, receipt, and self-serve extension.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { parkingPublic } from '../api';
import ParkingStatusPill from '../components/ParkingStatusPill.vue';
import DurationPicker from '../components/DurationPicker.vue';
import { formatMoney, formatDateTime, formatCountdown } from '../utils/format';
import { applyParkingChrome, restoreChrome } from '../utils/whitelabel';

const route = useRoute();
const token = route.params.token;

const data = ref(null);
const notFound = ref(false);
const confirming = ref(false); // "Confirming payment…" poll state
const showCanceled = ref(route.query.canceled === '1');
const extendOpen = ref(false);
const extending = ref(false);
const extendError = ref('');
const extendDuration = ref({ rate_type: 'hourly', quantity: 1 });

let clockTimer = null;
let pollTimer = null;
let serverOffsetMs = 0;
const nowMs = ref(Date.now());

const remainingMs = computed(() => {
  if (!data.value?.paid_through) return 0;
  return Date.parse(data.value.paid_through) - (nowMs.value + serverOffsetMs);
});

const overdueMs = computed(() => -remainingMs.value);

async function load() {
  try {
    const { data: d } = await parkingPublic.status(token);
    data.value = d;
    serverOffsetMs = Date.parse(d.server_now) - Date.now();
    applyParkingChrome(`${d.brand_name} — Parking ${d.confirmation_code}`);
    return d;
  } catch (err) {
    if (err?.response?.status === 404) notFound.value = true;
    else if (!data.value) notFound.value = true;
    return null;
  }
}

// After returning from Stripe (?paid=1), the webhook may not have landed yet.
// Poll until the payment shows up (status leaves pending, or net paid grows).
async function confirmPaymentLoop(initialNetPaid) {
  confirming.value = true;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => (pollTimer = setTimeout(r, 2000)));
    const d = await load();
    if (!d) break;
    if (d.status !== 'pending_payment' && d.net_paid_cents > initialNetPaid) break;
    if (d.status !== 'pending_payment' && i >= 2 && d.net_paid_cents >= initialNetPaid) break;
  }
  confirming.value = false;
}

onMounted(async () => {
  applyParkingChrome('Guest Parking');
  const d = await load();
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
  if (d && route.query.paid === '1') {
    const before = d.status === 'pending_payment' ? d.net_paid_cents : d.net_paid_cents - 1;
    if (d.status === 'pending_payment' || route.query.paid === '1') {
      confirmPaymentLoop(before);
    }
  }
});

onBeforeUnmount(() => {
  clearInterval(clockTimer);
  clearTimeout(pollTimer);
  restoreChrome();
});

async function submitExtend() {
  extendError.value = '';
  extending.value = true;
  try {
    const { data: d } = await parkingPublic.extend(token, {
      rate_type: extendDuration.value.rate_type,
      quantity: extendDuration.value.quantity,
    });
    window.location.assign(d.checkout_url);
  } catch (err) {
    extending.value = false;
    extendError.value = err?.response?.data?.error || 'Could not start the extension. Please try again.';
  }
}
</script>

<template>
  <div class="min-h-screen bg-warm px-4 py-8">
    <div class="mx-auto w-full max-w-md">
      <!-- Not found -->
      <div v-if="notFound" class="card p-8 text-center">
        <h1 class="font-serif text-2xl text-ink">Link not found</h1>
        <p class="mt-2 text-slate-warm">
          This parking link isn't valid. Check the link from your payment confirmation, or see the
          front desk for help.
        </p>
      </div>

      <!-- Loading -->
      <div v-else-if="!data" class="card h-72 animate-pulse border border-sand bg-white/60" />

      <template v-else>
        <header class="mb-6 text-center">
          <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink">
            <span class="font-serif text-2xl font-semibold text-white">P</span>
          </div>
          <h1 class="font-serif text-2xl text-ink">{{ data.brand_name }}</h1>
        </header>

        <p
          v-if="showCanceled"
          role="alert"
          class="mb-4 rounded-xl border border-sand bg-white px-4 py-3 text-sm text-slate-warm"
        >
          Payment canceled — no charge was made.
        </p>

        <!-- Confirming payment -->
        <div v-if="confirming && data.status === 'pending_payment'" class="card p-8 text-center">
          <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-sand border-t-ink" />
          <h2 class="font-serif text-xl text-ink">Confirming your payment…</h2>
          <p class="mt-2 text-sm text-slate-warm">This usually takes a few seconds.</p>
        </div>

        <div v-else class="space-y-4">
          <!-- Status card -->
          <div class="card p-6 text-center">
            <p class="text-xs font-medium uppercase tracking-wide text-slate-warm">Confirmation</p>
            <p class="font-serif text-4xl tracking-wide text-ink">{{ data.confirmation_code }}</p>
            <p class="mt-1 text-slate-warm">
              Plate <span class="font-semibold uppercase text-ink">{{ data.plate }}</span>
              <span v-if="data.room"> · Room {{ data.room }}</span>
            </p>
            <div class="mt-3"><ParkingStatusPill :status="data.status" /></div>

            <template v-if="data.paid_through">
              <div v-if="remainingMs > 0" class="mt-5">
                <p class="text-sm text-slate-warm">Time remaining</p>
                <p class="font-serif text-3xl text-ink" style="font-variant-numeric: tabular-nums">
                  {{ formatCountdown(remainingMs) }}
                </p>
                <p class="mt-1 text-sm text-slate-warm">
                  Paid through {{ formatDateTime(data.paid_through) }}
                </p>
              </div>
              <div v-else-if="data.status === 'expired'" class="mt-5">
                <p class="font-medium text-red-700">
                  Parking expired {{ formatCountdown(overdueMs) }} ago
                </p>
                <p class="mt-1 text-sm text-slate-warm">Extend below to avoid towing or fees.</p>
              </div>
              <p v-else-if="data.status === 'departed'" class="mt-4 text-sm text-slate-warm">
                This vehicle has checked out. Thanks for staying with us.
              </p>
            </template>
            <p v-else-if="data.status === 'pending_payment'" class="mt-4 text-sm text-slate-warm">
              Payment hasn't been completed for this session yet.
            </p>
            <p v-else-if="data.status === 'canceled'" class="mt-4 text-sm text-slate-warm">
              This session was canceled before payment.
              <RouterLink to="/park" class="font-medium text-terracotta-700 hover:underline">Start over</RouterLink>
            </p>

            <p v-if="data.net_paid_cents > 0" class="mt-4 text-sm text-slate-warm">
              Paid {{ formatMoney(data.net_paid_cents) }}
              <a
                v-if="data.receipt_url"
                :href="data.receipt_url"
                target="_blank"
                rel="noopener"
                class="ml-1 font-medium text-terracotta-700 hover:underline"
              >
                View receipt
              </a>
            </p>
          </div>

          <!-- Extend -->
          <div
            v-if="['active', 'expiring_soon', 'expired', 'complimentary'].includes(data.status) && data.kind !== 'comp'"
            class="card p-5"
          >
            <button
              v-if="!extendOpen"
              type="button"
              class="btn btn-primary w-full"
              @click="extendOpen = true"
            >
              Extend parking
            </button>
            <template v-else>
              <p class="label">Add more time</p>
              <DurationPicker v-model="extendDuration" :rates="data.rates" />
              <p v-if="extendError" role="alert" class="mt-3 text-sm text-red-700">{{ extendError }}</p>
              <div class="mt-4 flex gap-3">
                <button type="button" class="btn btn-ghost flex-1" @click="extendOpen = false">Cancel</button>
                <button type="button" class="btn btn-primary flex-1" :disabled="extending" @click="submitExtend">
                  {{ extending ? 'Redirecting…' : 'Pay & extend' }}
                </button>
              </div>
            </template>
          </div>

          <p class="text-center text-xs text-slate-warm">
            Keep this page bookmarked to check your time or extend later.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
