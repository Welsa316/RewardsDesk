<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { intake } from '../api';
import BrandMark from '../components/BrandMark.vue';
import AddressFields from '../components/AddressFields.vue';

const route = useRoute();

const hotelName = ref('Best Western Rewards');
const status = ref('form'); // 'form' | 'submitting' | 'success'
const formError = ref('');
const fieldErrors = reactive({});

const form = reactive({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  source: '',
  prefilled: false,
  consent: false,
  hp_url: '', // honeypot — must stay empty
});

// URL param -> form field (personalized prefilled links).
const PARAM_MAP = {
  fname: 'first_name',
  lname: 'last_name',
  email: 'email',
  phone: 'phone',
  address1: 'address_line1',
  address2: 'address_line2',
  city: 'city',
  state: 'state',
  zip: 'postal_code',
  country: 'country',
};

onMounted(async () => {
  const q = route.query;
  let prefilled = false;
  for (const [param, field] of Object.entries(PARAM_MAP)) {
    const v = q[param];
    if (typeof v === 'string' && v.trim()) {
      form[field] = v.trim();
      prefilled = true;
    }
  }
  if (typeof q.src === 'string' && q.src.trim()) form.source = q.src.trim();
  form.prefilled = prefilled;

  try {
    const { data } = await intake.publicConfig();
    if (data?.hotel_name) hotelName.value = data.hotel_name;
  } catch {
    // keep the default branding
  }
});

const canSubmit = computed(() => form.consent && status.value !== 'submitting');

function clearError(field) {
  if (fieldErrors[field]) delete fieldErrors[field];
}

async function submit() {
  formError.value = '';
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);

  if (!form.first_name.trim()) fieldErrors.first_name = 'First name is required.';
  if (!form.last_name.trim()) fieldErrors.last_name = 'Last name is required.';
  if (!form.consent) fieldErrors.consent = 'Please check the box to continue.';
  if (Object.keys(fieldErrors).length) return;

  status.value = 'submitting';
  try {
    await intake.submit({ ...form });
    status.value = 'success';
  } catch (err) {
    status.value = 'form';
    const data = err?.response?.data;
    if (data?.fields) Object.assign(fieldErrors, data.fields);
    formError.value = data?.error || 'Something went wrong. Please try again.';
  }
}
</script>

<template>
  <div class="min-h-screen bg-warm px-4 py-8">
    <div class="mx-auto w-full max-w-md">
      <!-- Success -->
      <div v-if="status === 'success'" class="card p-8 text-center">
        <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg class="h-7 w-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 class="font-serif text-2xl text-ink">You're all set</h1>
        <p class="mt-3 text-slate-warm">
          Thanks! Stop by the front desk at check-in and we'll finish setting up your Best Western
          Rewards account so you start earning points.
        </p>
      </div>

      <!-- Form -->
      <div v-else>
        <header class="mb-6 text-center">
          <BrandMark size="md" class="mb-3" />
          <h1 class="font-serif text-2xl text-ink">Join Best Western Rewards</h1>
          <p class="mt-1 text-sm text-slate-warm">
            {{ hotelName }} — add your details and we'll finish enrollment at the front desk.
          </p>
        </header>

        <form class="card space-y-5 p-6" novalidate @submit.prevent="submit">
          <p
            v-if="formError"
            class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {{ formError }}
          </p>

          <!-- Name -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="first_name">First name</label>
              <input
                id="first_name"
                v-model="form.first_name"
                class="input"
                :class="{ 'input-error': fieldErrors.first_name }"
                autocomplete="given-name"
                @input="clearError('first_name')"
              />
              <p v-if="fieldErrors.first_name" class="field-error">{{ fieldErrors.first_name }}</p>
            </div>
            <div>
              <label class="label" for="last_name">Last name</label>
              <input
                id="last_name"
                v-model="form.last_name"
                class="input"
                :class="{ 'input-error': fieldErrors.last_name }"
                autocomplete="family-name"
                @input="clearError('last_name')"
              />
              <p v-if="fieldErrors.last_name" class="field-error">{{ fieldErrors.last_name }}</p>
            </div>
          </div>

          <!-- Email -->
          <div>
            <label class="label" for="email">Email</label>
            <input
              id="email"
              v-model="form.email"
              class="input"
              :class="{ 'input-error': fieldErrors.email }"
              type="email"
              inputmode="email"
              autocomplete="email"
              @input="clearError('email')"
            />
            <p v-if="fieldErrors.email" class="field-error">{{ fieldErrors.email }}</p>
          </div>

          <!-- Phone -->
          <div>
            <label class="label" for="phone">Phone</label>
            <input
              id="phone"
              v-model="form.phone"
              class="input"
              :class="{ 'input-error': fieldErrors.phone }"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              @input="clearError('phone')"
            />
            <p v-if="fieldErrors.phone" class="field-error">{{ fieldErrors.phone }}</p>
          </div>

          <!-- Address -->
          <AddressFields :form="form" :errors="fieldErrors" />

          <!-- Honeypot: hidden from real users -->
          <div class="hidden" aria-hidden="true">
            <label>Leave this field empty
              <input v-model="form.hp_url" type="text" name="hp_url" tabindex="-1" autocomplete="off" />
            </label>
          </div>

          <!-- Consent -->
          <div>
            <label class="flex cursor-pointer items-start gap-3">
              <input
                v-model="form.consent"
                type="checkbox"
                class="mt-0.5 h-5 w-5 shrink-0 rounded border-sand text-terracotta focus:ring-terracotta/40"
                @change="clearError('consent')"
              />
              <span class="text-sm leading-relaxed text-slate-warm">
                I'd like to join Best Western Rewards. I authorize {{ hotelName }} to use this
                information to enroll me and to contact me about my membership.
              </span>
            </label>
            <p v-if="fieldErrors.consent" class="field-error">{{ fieldErrors.consent }}</p>
          </div>

          <button type="submit" class="btn btn-primary w-full" :disabled="!canSubmit">
            <span v-if="status === 'submitting'">Submitting…</span>
            <span v-else>Join Rewards</span>
          </button>

          <p class="text-center text-xs text-slate-warm/70">
            We use these details only to set up your rewards account at the desk.
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
