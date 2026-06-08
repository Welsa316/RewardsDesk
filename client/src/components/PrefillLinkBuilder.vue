<script setup>
import { reactive, ref, computed } from 'vue';
import QRCode from 'qrcode';
import { copyText } from '../utils/clipboard';
import { sourceLabel } from '../utils/format';

const props = defineProps({
  baseUrl: { type: String, required: true },
  sources: { type: Array, default: () => [] },
});

const FIELDS = ['fname', 'lname', 'email', 'phone', 'address1', 'city', 'state', 'zip'];
const form = reactive({
  fname: '', lname: '', email: '', phone: '', address1: '', city: '', state: '', zip: '',
  src: props.sources.includes('canary') ? 'canary' : props.sources[0] || 'canary',
});
const copied = ref(false);
const qr = ref('');

const hasData = computed(() => FIELDS.some((k) => form[k]?.trim()));

const link = computed(() => {
  const params = new URLSearchParams();
  for (const k of FIELDS) if (form[k]?.trim()) params.set(k, form[k].trim());
  if (form.src) params.set('src', form.src);
  const qs = params.toString();
  return `${props.baseUrl}/enroll${qs ? '?' + qs : ''}`;
});

async function copy() {
  if (await copyText(link.value)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  }
}

async function genQr() {
  try {
    qr.value = await QRCode.toDataURL(link.value, {
      width: 320,
      margin: 2,
      color: { dark: '#0F1B2D', light: '#FFFFFF' },
    });
  } catch {
    qr.value = '';
  }
}
</script>

<template>
  <div class="card p-5">
    <div class="mb-4 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <p class="text-sm text-amber-900">
        Prefilled links carry personal info — use them <strong>only for per-guest sends</strong>
        (Canary or email). Never print a prefilled QR on a wall; printed/wall codes must stay
        generic (source only).
      </p>
    </div>

    <div class="grid grid-cols-2 gap-3">
      <input v-model="form.fname" class="input" placeholder="First name" autocomplete="off" />
      <input v-model="form.lname" class="input" placeholder="Last name" autocomplete="off" />
    </div>
    <input v-model="form.email" class="input mt-3" placeholder="Email" autocomplete="off" />
    <input v-model="form.phone" class="input mt-3" placeholder="Phone" autocomplete="off" />
    <input v-model="form.address1" class="input mt-3" placeholder="Street address" autocomplete="off" />
    <div class="mt-3 grid grid-cols-3 gap-3">
      <input v-model="form.city" class="input" placeholder="City" autocomplete="off" />
      <input v-model="form.state" class="input" placeholder="State" autocomplete="off" />
      <input v-model="form.zip" class="input" placeholder="ZIP" autocomplete="off" />
    </div>
    <div class="mt-3">
      <label class="label" for="prefill_src">Source tag</label>
      <select id="prefill_src" v-model="form.src" class="input">
        <option v-for="s in sources" :key="s" :value="s">{{ sourceLabel(s) }}</option>
      </select>
    </div>

    <div class="mt-4 rounded-xl border border-sand bg-warm/50 p-3">
      <p class="break-all text-sm text-ink">{{ link }}</p>
    </div>
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" class="btn btn-primary" :disabled="!hasData" @click="copy">
        {{ copied ? 'Copied link' : 'Copy link' }}
      </button>
      <button
        type="button"
        class="btn border border-sand bg-white text-ink hover:bg-sand/50"
        :disabled="!hasData"
        @click="genQr"
      >
        Generate QR
      </button>
      <a v-if="qr" :href="qr" download="rewardsdesk-prefilled.png" class="btn btn-secondary">
        Download QR
      </a>
    </div>
    <img v-if="qr" :src="qr" alt="Prefilled link QR" class="mt-3 h-40 w-40 rounded-lg border border-sand" />
  </div>
</template>
