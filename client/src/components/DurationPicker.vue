<script setup>
import { computed } from 'vue';
import { formatMoney } from '../utils/format';

// Display-only duration + price picker. The server independently recomputes
// the price from the same rules; this component never submits an amount.
const props = defineProps({
  rates: { type: Object, required: true }, // { hourly_cents, daily_cents }
  modelValue: { type: Object, required: true }, // { rate_type, quantity }
});
const emit = defineEmits(['update:modelValue']);

const HOURLY_MAX = 23;
const DAILY_MAX = 14;

const rateType = computed(() => props.modelValue.rate_type);
const quantity = computed(() => props.modelValue.quantity);
const maxQty = computed(() => (rateType.value === 'daily' ? DAILY_MAX : HOURLY_MAX));

function setRate(rate_type) {
  if (rate_type === rateType.value) return;
  emit('update:modelValue', { rate_type, quantity: 1 });
}

function step(delta) {
  const next = Math.min(maxQty.value, Math.max(1, quantity.value + delta));
  emit('update:modelValue', { rate_type: rateType.value, quantity: next });
}

const totalCents = computed(() => {
  if (rateType.value === 'daily') return quantity.value * props.rates.daily_cents;
  return Math.min(quantity.value * props.rates.hourly_cents, props.rates.daily_cents);
});

const capped = computed(
  () =>
    rateType.value === 'hourly' &&
    quantity.value * props.rates.hourly_cents > props.rates.daily_cents,
);

const unitLabel = computed(() => {
  const q = quantity.value;
  return rateType.value === 'daily' ? (q === 1 ? 'day' : 'days') : q === 1 ? 'hour' : 'hours';
});
</script>

<template>
  <div>
    <div class="flex rounded-xl border border-sand p-1" role="radiogroup" aria-label="Parking rate">
      <button
        type="button"
        role="radio"
        :aria-checked="rateType === 'hourly'"
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="rateType === 'hourly' ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
        @click="setRate('hourly')"
      >
        Hourly · {{ formatMoney(rates.hourly_cents) }}/hr
      </button>
      <button
        type="button"
        role="radio"
        :aria-checked="rateType === 'daily'"
        class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
        :class="rateType === 'daily' ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
        @click="setRate('daily')"
      >
        Daily · {{ formatMoney(rates.daily_cents) }}/day
      </button>
    </div>

    <div class="mt-3 flex items-center justify-between rounded-xl border border-sand bg-white px-4 py-3">
      <button
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-lg border border-sand text-xl text-ink transition hover:bg-sand/50 disabled:opacity-40"
        :disabled="quantity <= 1"
        aria-label="Decrease duration"
        @click="step(-1)"
      >
        −
      </button>
      <div class="text-center">
        <p class="font-serif text-2xl text-ink">{{ quantity }} {{ unitLabel }}</p>
        <p class="text-sm text-slate-warm">
          Total <span class="font-semibold text-ink">{{ formatMoney(totalCents) }}</span>
        </p>
      </div>
      <button
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-lg border border-sand text-xl text-ink transition hover:bg-sand/50 disabled:opacity-40"
        :disabled="quantity >= maxQty"
        aria-label="Increase duration"
        @click="step(1)"
      >
        +
      </button>
    </div>

    <p v-if="capped" class="mt-2 text-center text-xs text-slate-warm">
      Capped at the daily rate — you never pay more than {{ formatMoney(rates.daily_cents) }} per day.
    </p>
  </div>
</template>
