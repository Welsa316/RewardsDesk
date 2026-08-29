<script setup>
// Public guest parking page — WHITE-LABEL. No BrandMark, no rewards strings;
// branding comes solely from settings.parking_brand_name via the public config.
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { parkingPublic } from '../api';
import DurationPicker from '../components/DurationPicker.vue';
import { formatMoney } from '../utils/format';
import { US_STATES, DEFAULT_STATE } from '../utils/states';
import PromoStrip from '../components/PromoStrip.vue';
import { applyParkingChrome, restoreChrome, parkingTitle } from '../utils/whitelabel';

const route = useRoute();

// Empty until the configured name arrives, so the header does not print one
// name and then replace it. The heading reserves its height either way.
const brand = ref('');
const rates = ref(null); // { daily_cents }
const standardCents = ref(0);
const promo = ref(null); // { name, rate_cents, end_date } while one is running
const loadError = ref(false);
const submitting = ref(false);
const formError = ref('');
const fieldErrors = reactive({});
const showCanceled = ref(route.query.canceled === '1');
const alreadyParked = ref(null); // { paid_through, status_token? } — set on a 409

const form = reactive({
  guest_name: '',
  phone: '',
  plate: '',
  plate_state: DEFAULT_STATE,
  room: '',
  email: '',
  vehicle_desc: '',
  lot: '',
  hp_url: '', // honeypot — must stay empty
});
const duration = ref({ rate_type: 'daily', quantity: 1 });

// Prefill contract (also used by the future SMS app):
// /park?src=<lot>&name=&phone=&plate=&room=&rate=daily&qty=N
const PARAM_MAP = { name: 'guest_name', phone: 'phone', plate: 'plate', room: 'room', state: 'plate_state' };

onMounted(async () => {
  applyParkingChrome('Guest Parking');
  const q = route.query;
  for (const [param, field] of Object.entries(PARAM_MAP)) {
    if (typeof q[param] !== 'string' || !q[param].trim()) continue;
    const value = q[param].trim();
    if (field === 'plate_state') {
      // An unrecognised code would leave the select showing nothing, so keep
      // the default rather than accepting whatever the link carried.
      const code = value.toUpperCase();
      if (US_STATES.includes(code)) form.plate_state = code;
      continue;
    }
    form[field] = value;
  }
  if (typeof q.src === 'string' && q.src.trim()) form.lot = q.src.trim();
  const qty = Number(q.qty);
  if (q.rate === 'daily' && Number.isInteger(qty) && qty > 0) {
    duration.value = { rate_type: q.rate, quantity: Math.min(qty, q.rate === 'daily' ? 14 : 23) };
  }

  try {
    const { data } = await parkingPublic.config();
    brand.value = data.brand_name;
    rates.value = { daily_cents: data.daily_cents };
    standardCents.value = data.standard_daily_cents || data.daily_cents;
    promo.value = data.promo || null;
    applyParkingChrome(parkingTitle(data.brand_name));
  } catch {
    loadError.value = true;
  }
});
onBeforeUnmount(restoreChrome);

const canSubmit = computed(() => !submitting.value && rates.value);

function formatPromoEnd(dateStr) {
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatUntil(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function clearError(field) {
  if (fieldErrors[field]) delete fieldErrors[field];
}

async function submit() {
  formError.value = '';
  showCanceled.value = false;
  alreadyParked.value = null;
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  if (!form.guest_name.trim()) fieldErrors.guest_name = 'Name is required.';
  if (!form.phone.trim()) fieldErrors.phone = 'Phone number is required.';
  if (!form.plate.trim()) fieldErrors.plate = 'License plate is required.';
  if (Object.keys(fieldErrors).length) return;

  submitting.value = true;
  try {
    const { data } = await parkingPublic.checkout({
      ...form,
      plate: form.plate.toUpperCase(),
      plate_state: form.plate_state,
      rate_type: duration.value.rate_type,
      quantity: duration.value.quantity,
    });
    window.location.assign(data.checkout_url); // hosted Stripe Checkout
  } catch (err) {
    submitting.value = false;
    const data = err?.response?.data;
    if (data?.already_parked) {
      alreadyParked.value = { paid_through: data.paid_through, status_token: data.status_token };
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (data?.fields) Object.assign(fieldErrors, data.fields);
    formError.value = data?.error || 'Something went wrong. Please try again.';
  }
}
</script>

<template>
  <div class="min-h-screen bg-warm px-4 py-8">
    <div class="mx-auto w-full max-w-md">
      <header class="mb-6 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink">
          <span class="font-serif text-2xl font-semibold text-white">P</span>
        </div>
        <h1 class="flex min-h-8 items-center justify-center font-serif text-2xl text-ink">{{ brand }}</h1>
        <p class="mt-1 text-sm text-slate-warm">Pay for parking in under a minute.</p>
      </header>

      <PromoStrip />

      <!-- A rate promo is a price change, so it is stated plainly next to the
           standard rate rather than dressed up as marketing. -->
      <p
        v-if="promo"
        class="mb-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-center text-sm text-green-900"
      >
        <strong>{{ promo.name }}: {{ formatMoney(promo.rate_cents) }}/day</strong>
        through {{ formatPromoEnd(promo.end_date) }}
        <span class="ml-1 text-green-800/70 line-through">{{ formatMoney(standardCents) }}/day</span>
      </p>

      <p
        v-if="showCanceled"
        role="alert"
        class="mb-4 rounded-xl border border-sand bg-white px-4 py-3 text-sm text-slate-warm"
      >
        Payment canceled — you haven't been charged. Pick up where you left off below.
      </p>

      <div v-if="loadError" class="card p-8 text-center">
        <p class="text-slate-warm">Parking is unavailable right now. Please see the front desk.</p>
      </div>

      <!-- This car already has time on it — never let the guest pay twice. -->
      <div v-else-if="alreadyParked" role="alert" class="card space-y-4 p-6 text-center">
        <h2 class="font-serif text-xl text-ink">This car is already parked</h2>
        <p class="text-sm text-slate-warm">
          <strong class="text-ink">{{ form.plate.toUpperCase() }}</strong> is paid through
          <strong class="text-ink">{{ formatUntil(alreadyParked.paid_through) }}</strong>.
          You have not been charged again.
        </p>
        <a
          v-if="alreadyParked.status_token"
          :href="`/park/s/${alreadyParked.status_token}`"
          class="btn btn-primary block w-full"
        >
          View my parking
        </a>
        <p v-else class="text-sm text-slate-warm">
          Open the link from your payment confirmation to see your time or add more.
          If you can't find it, the front desk can look it up.
        </p>
        <button type="button" class="btn btn-ghost w-full" @click="alreadyParked = null">
          This is a different car
        </button>
      </div>

      <form v-else class="card space-y-5 p-6" novalidate @submit.prevent="submit">
        <p
          v-if="formError"
          role="alert"
          class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ formError }}
        </p>

        <div>
          <label class="label" for="pk_name">Name</label>
          <input
            id="pk_name"
            v-model="form.guest_name"
            name="name"
            class="input"
            :class="{ 'input-error': fieldErrors.guest_name }"
            :aria-invalid="fieldErrors.guest_name ? 'true' : undefined"
            :aria-describedby="fieldErrors.guest_name ? 'pk_name-error' : undefined"
            autocomplete="name"
            autocapitalize="words"
            spellcheck="false"
            @input="clearError('guest_name')"
          />
          <p v-if="fieldErrors.guest_name" id="pk_name-error" class="field-error">{{ fieldErrors.guest_name }}</p>
        </div>

        <div>
          <label class="label" for="pk_phone">Phone</label>
          <input
            id="pk_phone"
            v-model="form.phone"
            name="phone"
            class="input"
            :class="{ 'input-error': fieldErrors.phone }"
            :aria-invalid="fieldErrors.phone ? 'true' : undefined"
            :aria-describedby="fieldErrors.phone ? 'pk_phone-error' : undefined"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            @input="clearError('phone')"
          />
          <p v-if="fieldErrors.phone" id="pk_phone-error" class="field-error">{{ fieldErrors.phone }}</p>
        </div>

        <div>
          <label class="label" for="pk_plate">License plate</label>
          <div class="flex gap-2">
            <input
              id="pk_plate"
              v-model="form.plate"
              name="plate"
              class="input uppercase"
              :class="{ 'input-error': fieldErrors.plate }"
              :aria-invalid="fieldErrors.plate ? 'true' : undefined"
              :aria-describedby="fieldErrors.plate ? 'pk_plate-error' : undefined"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              placeholder="ABC1234"
              @input="clearError('plate')"
            />
            <select
              id="pk_plate_state"
              v-model="form.plate_state"
              class="input !w-24 shrink-0"
              aria-label="License plate state"
            >
              <option v-for="st in US_STATES" :key="st" :value="st">{{ st }}</option>
            </select>
          </div>
          <p v-if="fieldErrors.plate" id="pk_plate-error" class="field-error">{{ fieldErrors.plate }}</p>
        </div>

        <div>
          <label class="label" for="pk_room">Room <span class="text-slate-warm">(optional)</span></label>
          <input id="pk_room" v-model="form.room" name="room" class="input" autocomplete="off" />
        </div>

        <div>
          <label class="label" for="pk_vehicle">Vehicle <span class="text-slate-warm">(optional)</span></label>
          <input
            id="pk_vehicle"
            v-model="form.vehicle_desc"
            name="vehicle"
            class="input"
            autocomplete="off"
            placeholder="Silver Camry"
          />
        </div>

        <div>
          <label class="label" for="pk_email">Email for receipt <span class="text-slate-warm">(optional)</span></label>
          <input
            id="pk_email"
            v-model="form.email"
            name="email"
            class="input"
            :class="{ 'input-error': fieldErrors.email }"
            :aria-invalid="fieldErrors.email ? 'true' : undefined"
            :aria-describedby="fieldErrors.email ? 'pk_email-error' : undefined"
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            @input="clearError('email')"
          />
          <p v-if="fieldErrors.email" id="pk_email-error" class="field-error">{{ fieldErrors.email }}</p>
        </div>

        <!-- Honeypot: hidden from real users -->
        <div class="hidden" aria-hidden="true">
          <label>Leave this field empty
            <input v-model="form.hp_url" type="text" name="hp_url" tabindex="-1" autocomplete="off" />
          </label>
        </div>

        <div v-if="rates">
          <p class="label">How long are you parking?</p>
          <DurationPicker v-model="duration" :rates="rates" :standard-cents="standardCents" />
        </div>
        <div v-else class="h-32 animate-pulse rounded-xl border border-sand bg-white/60" />

        <button type="submit" class="btn btn-primary w-full" :disabled="!canSubmit">
          <span v-if="submitting">Redirecting to secure payment…</span>
          <span v-else>Continue to payment</span>
        </button>

        <p class="text-center text-xs text-slate-warm">
          Card payments are processed securely by Stripe. Your card details never touch our systems.
        </p>
      </form>
    </div>
  </div>
</template>
