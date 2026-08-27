<script setup>
import { computed } from 'vue';
import { formatMoney } from '../utils/format';

// Display-only duration + price picker. The server independently recomputes
// the price from the same rules; this component never submits an amount.
const props = defineProps({
  rates: { type: Object, required: true }, // { daily_cents }
  // The pre-promo rate, shown struck through when a promo is running.
  standardCents: { type: Number, default: 0 },
  modelValue: { type: Object, required: true }, // { rate_type, quantity }
});
const emit = defineEmits(['update:modelValue']);

// Parking is sold by the day only.
const DAILY_MAX = 14;

const rateType = computed(() => props.modelValue.rate_type);
const quantity = computed(() => props.modelValue.quantity);
const maxQty = computed(() => DAILY_MAX);
const discounted = computed(
  () => props.standardCents > 0 && props.rates.daily_cents < props.standardCents,
);

function step(delta) {
  const next = Math.min(maxQty.value, Math.max(1, quantity.value + delta));
  emit('update:modelValue', { rate_type: rateType.value, quantity: next });
}

function setQuantity(n) {
  const next = Math.min(maxQty.value, Math.max(1, Math.round(Number(n) || 1)));
  emit('update:modelValue', { rate_type: rateType.value, quantity: next });
}

// Buying a week meant six taps on "+", and the 14-day maximum meant thirteen —
// standing outside on a phone. These cover almost every real stay in one tap.
const QUICK_PICKS = [1, 2, 3, 7];
const quickPicks = computed(() => QUICK_PICKS.filter((n) => n <= maxQty.value));

const totalCents = computed(() => quantity.value * props.rates.daily_cents);
const unitLabel = computed(() => (quantity.value === 1 ? 'day' : 'days'));
</script>

<template>
  <div>
    <p class="rounded-xl border border-sand bg-white px-4 py-2.5 text-center text-sm">
      <span class="font-semibold text-ink">{{ formatMoney(rates.daily_cents) }}</span
      ><span class="text-slate-warm">/day</span>
      <span v-if="discounted" class="ml-2 text-slate-warm line-through">
        {{ formatMoney(standardCents) }}
      </span>
    </p>

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

    <div class="mt-3 flex flex-wrap justify-center gap-2">
      <button
        v-for="n in quickPicks"
        :key="n"
        type="button"
        class="rounded-full border px-3 py-1.5 text-sm transition"
        :class="
          quantity === n
            ? 'border-ink bg-ink text-white'
            : 'border-sand bg-white text-ink hover:bg-sand/50'
        "
        :aria-pressed="quantity === n"
        @click="setQuantity(n)"
      >
        {{ n }} {{ n === 1 ? 'day' : 'days' }}
      </button>
    </div>

  </div>
</template>
