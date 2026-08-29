<script setup>
// Guest parking status page (white-label, tokenized URL — no login).
// Shows time remaining, receipt, and self-serve extension.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { parkingPublic } from '../api';
import PromoStrip from '../components/PromoStrip.vue';
import ParkingStatusPill from '../components/ParkingStatusPill.vue';
import DurationPicker from '../components/DurationPicker.vue';
import { formatMoney, formatDateTime, formatCountdown } from '../utils/format';
import { formatPlate } from '../utils/states';
import { applyParkingChrome, restoreChrome, parkingTitle } from '../utils/whitelabel';

const route = useRoute();
const token = route.params.token;

const data = ref(null);
const notFound = ref(false);
const loadError = ref(''); // anything that is NOT a bad token
const confirming = ref(false); // "Confirming payment…" poll state
const stillProcessing = ref(false); // poll gave up but the guest did pay
const showCanceled = ref(route.query.canceled === '1');
const extendOpen = ref(false);
const extending = ref(false);
const extendError = ref('');
const extendDuration = ref({ rate_type: 'daily', quantity: 1 });

let clockTimer = null;
let pollTimer = null;
let serverOffsetMs = 0;
const nowMs = ref(Date.now());

const remainingMs = computed(() => {
  if (!data.value?.paid_through) return 0;
  return Date.parse(data.value.paid_through) - (nowMs.value + serverOffsetMs);
});

const overdueMs = computed(() => -remainingMs.value);

// `status` is a snapshot from the last fetch, but the countdown keeps running.
// Deriving expiry locally means the moment paid_through passes, the guest sees
// the warning — rather than every branch failing and the whole time block
// silently disappearing off the page.
const isExpired = computed(
  () =>
    !!data.value?.paid_through &&
    remainingMs.value <= 0 &&
    data.value.status !== 'departed' &&
    data.value.status !== 'canceled',
);

let alive = true;

// The clock re-renders the whole component every second, so it should only run
// when something on screen is actually counting down. It used to tick forever
// — including on a departed or canceled session, and in a backgrounded tab the
// page itself tells the guest to keep open.
function startClock() {
  stopClock();
  // Refresh before any early return: nowMs was captured at setup, and the
  // "expired N ago" line reads from it even when no interval is running.
  nowMs.value = Date.now();
  if (document.visibilityState !== 'visible') return;
  const d = data.value;
  if (!d?.paid_through) return;
  if (d.status === 'departed' || d.status === 'canceled') return;
  if (remainingMs.value <= 0) return; // already expired; nothing left to count
  clockTimer = setInterval(() => {
    nowMs.value = Date.now();
    if (remainingMs.value <= 0) stopClock(); // settled on expired; nothing left to tick
  }, 1000);
}

function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    load().then(startClock);
  } else {
    stopClock();
  }
}

async function load() {
  try {
    const { data: d } = await parkingPublic.status(token);
    if (!alive) return null;
    data.value = d;
    loadError.value = '';
    serverOffsetMs = Date.parse(d.server_now) - Date.now();
    applyParkingChrome(parkingTitle(d.brand_name, d.confirmation_code));
    return d;
  } catch (err) {
    if (!alive) return null;
    // Only a real 404 means the link is bad. Telling a guest who just paid $32
    // that their proof of payment "isn't valid" because their signal dropped
    // in a concrete garage sends them to the front desk for nothing.
    const status = err?.response?.status;
    if (status === 404) notFound.value = true;
    else if (status === 429) loadError.value = 'Checking too often — wait a moment and try again.';
    else loadError.value = "Couldn't reach the parking service. Check your signal and try again.";
    return null;
  }
}

// After returning from Stripe (?paid=1), the webhook may not have landed yet.
// Poll until the payment shows up (status leaves pending, or net paid grows).
// Backing off rather than polling flat-out every 2s: each poll asks Stripe
// directly about the outstanding checkout, so a flat interval meant ~15 live
// Stripe round trips inside the guest's own requests, at 30/min against a
// 60/min limiter. This covers the same ~40s in 7 requests.
const POLL_BACKOFF_MS = [1500, 2000, 2500, 3000, 4000, 6000, 8000, 12000];

async function confirmPaymentLoop(initialNetPaid) {
  confirming.value = true;
  for (const wait of POLL_BACKOFF_MS) {
    await new Promise((r) => (pollTimer = setTimeout(r, wait)));
    if (!alive) return;
    const d = await load();
    if (!alive) return;
    if (!d) continue; // a transient failure mid-poll is not a reason to give up
    if (d.status !== 'pending_payment' && d.net_paid_cents > initialNetPaid) break;
    if (d.status !== 'pending_payment' && d.net_paid_cents >= initialNetPaid && wait >= 2500) break;
  }
  if (!alive) return;
  confirming.value = false;
  // Never tell someone who has just paid that payment "hasn't been completed".
  if (data.value?.status === 'pending_payment') stillProcessing.value = true;
}

onMounted(async () => {
  applyParkingChrome('Guest Parking');
  document.addEventListener('visibilitychange', onVisibility);
  const d = await load();
  startClock();
  if (d && route.query.paid === '1') {
    const before = d.status === 'pending_payment' ? d.net_paid_cents : d.net_paid_cents - 1;
    if (d.status === 'pending_payment' || route.query.paid === '1') {
      confirmPaymentLoop(before);
    }
  }
});

onBeforeUnmount(() => {
  // clearTimeout only kills the timer that is pending right now. If the loop is
  // sitting in `await load()` it would otherwise resume after unmount, re-apply
  // the parking chrome over the staff app's title, and arm a fresh timer that
  // nothing will ever clear.
  alive = false;
  stopClock();
  clearTimeout(pollTimer);
  document.removeEventListener('visibilitychange', onVisibility);
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
      <PromoStrip />
      <!-- Not found -->
      <div v-if="notFound" class="card p-8 text-center">
        <h1 class="font-serif text-2xl text-ink">Link not found</h1>
        <p class="mt-2 text-slate-warm">
          This parking link isn't valid. Check the link from your payment confirmation, or see the
          front desk for help.
        </p>
      </div>

      <!-- Couldn't load — distinct from a bad token, and recoverable -->
      <div v-else-if="loadError && !data" class="card p-8 text-center">
        <h1 class="font-serif text-2xl text-ink">Can't load your parking</h1>
        <p class="mt-2 text-slate-warm">{{ loadError }}</p>
        <button class="btn btn-primary mt-5 w-full" @click="load">Try again</button>
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
              Plate <span class="font-semibold uppercase text-ink">{{ formatPlate(data.plate, data.plate_state) }}</span>
              <span v-if="data.room"> · Room {{ data.room }}</span>
            </p>
            <div class="mt-3"><ParkingStatusPill :status="data.status" /></div>
            <p v-if="loadError" class="mt-3 text-xs text-slate-warm">
              {{ loadError }}
              <button type="button" class="font-medium text-maroon-700 hover:underline" @click="load">
                Retry
              </button>
            </p>

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
              <div v-else-if="isExpired" class="mt-5">
                <p class="font-medium text-red-700">
                  {{ overdueMs < 60000 ? 'Parking has just expired' : `Parking expired ${formatCountdown(overdueMs)} ago` }}
                </p>
                <p class="mt-1 text-sm text-slate-warm">
                  {{
                    data.kind === 'comp'
                      ? 'Your parking was provided by the hotel — see the front desk to add more time.'
                      : 'Add time below to avoid towing or fees.'
                  }}
                </p>
              </div>
              <p v-else-if="data.status === 'departed'" class="mt-4 text-sm text-slate-warm">
                This vehicle has checked out. Thanks for staying with us.
              </p>
            </template>
            <p v-else-if="stillProcessing" class="mt-4 text-sm text-slate-warm">
              We've received your payment — it can take a minute to appear here.
              <button type="button" class="font-medium text-maroon-700 hover:underline" @click="load">
                Refresh
              </button>
              , or show this code at the front desk.
            </p>
            <p v-else-if="data.status === 'pending_payment'" class="mt-4 text-sm text-slate-warm">
              Payment hasn't been completed yet.
            </p>
            <p v-else-if="data.status === 'canceled'" class="mt-4 text-sm text-slate-warm">
              This session was canceled before payment.
              <RouterLink to="/park" class="font-medium text-maroon-700 hover:underline">Start over</RouterLink>
            </p>

            <p v-if="data.net_paid_cents > 0" class="mt-4 text-sm text-slate-warm">
              Paid {{ formatMoney(data.net_paid_cents) }}
              <a
                v-if="data.receipt_url"
                :href="data.receipt_url"
                target="_blank"
                rel="noopener"
                class="ml-1 font-medium text-maroon-700 hover:underline"
              >
                View receipt
              </a>
            </p>
          </div>

          <!-- Extend -->
          <div
            v-if="['active', 'expiring_soon', 'expired'].includes(data.status) && data.kind !== 'comp'"
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
