<script setup>
import { ref, reactive, onMounted } from 'vue';
import { settings as api } from '../api';
import { useToastStore } from '../stores/toast';

const toast = useToastStore();

const form = reactive({
  parking_brand_name: '',
  parking_capacity: 0,
  daily_dollars: '',
  parking_expiring_soon_minutes: 60,
  parking_lots: [],
});
const newLot = ref('');
const loading = ref(true);
const loadError = ref('');
const saving = ref(false);

async function init() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.get();
    form.parking_brand_name = data.parking_brand_name || '';
    form.parking_capacity = data.parking_capacity;
    form.daily_dollars = (data.parking_daily_cents / 100).toFixed(2);
    form.parking_expiring_soon_minutes = data.parking_expiring_soon_minutes;
    form.parking_lots = [...(data.parking_lots || [])];
  } catch {
    loadError.value = 'Could not load parking settings.';
  } finally {
    loading.value = false;
  }
}
onMounted(init);

function addLot() {
  const s = newLot.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (s && !form.parking_lots.includes(s)) form.parking_lots.push(s);
  newLot.value = '';
}
function removeLot(l) {
  form.parking_lots = form.parking_lots.filter((x) => x !== l);
}

async function save() {
  const daily = Math.round(Number(form.daily_dollars) * 100);
  if (!Number.isInteger(daily) || daily < 0) {
    toast.error('Rates must be valid dollar amounts.');
    return;
  }
  saving.value = true;
  try {
    await api.update({
      parking_brand_name: form.parking_brand_name,
      parking_capacity: Number(form.parking_capacity),
      parking_daily_cents: daily,
      parking_expiring_soon_minutes: Number(form.parking_expiring_soon_minutes),
      parking_lots: form.parking_lots,
    });
    toast.success('Parking settings saved');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not save parking settings.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="font-serif text-2xl text-ink">Parking settings</h1>
    <p class="text-sm text-slate-warm">Guest-facing brand, rates, capacity, and lots.</p>

    <div v-if="loading" class="mt-6 h-96 animate-pulse rounded-2xl border border-sand bg-white/60" />

    <div v-else-if="loadError" class="card mt-6 p-6 text-center">
      <p class="text-slate-warm">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="init">Retry</button>
    </div>

    <form v-else class="mt-6 space-y-4" novalidate @submit.prevent="save">
      <div class="card space-y-4 p-5">
        <div>
          <label class="label" for="pb_brand">Guest-facing brand name</label>
          <input id="pb_brand" v-model="form.parking_brand_name" class="input" />
          <p class="mt-1 text-xs text-slate-warm">
            Shown on the public parking pages. Guests never see the rewards app.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-4">
          
          <div>
            <label class="label" for="pb_daily">Daily rate ($)</label>
            <input id="pb_daily" v-model="form.daily_dollars" class="input" inputmode="decimal" />
          </div>
        </div>
        <p class="text-xs text-slate-warm">
          Hourly totals are automatically capped at the daily rate. Rate changes apply to new
          purchases only.
        </p>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label" for="pb_capacity">Total spaces</label>
            <input id="pb_capacity" v-model.number="form.parking_capacity" type="number" min="0" inputmode="numeric" class="input" />
          </div>
          <div>
            <label class="label" for="pb_exp">"Expiring soon" window (min)</label>
            <input id="pb_exp" v-model.number="form.parking_expiring_soon_minutes" type="number" min="5" inputmode="numeric" class="input" />
          </div>
        </div>
      </div>

      <div class="card p-5">
        <label class="label">Lots / sign locations</label>
        <p class="mb-3 text-xs text-slate-warm">
          Each lot gets its own QR code tagging where the guest scanned (e.g. <code>lot-a</code>,
          <code>garage-1</code>).
        </p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="l in form.parking_lots"
            :key="l"
            class="inline-flex items-center gap-1.5 rounded-full bg-sand/70 py-1 pl-3 pr-1.5 text-sm text-ink"
          >
            {{ l }}
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-full text-slate-warm hover:bg-ink/10 hover:text-ink"
              :aria-label="`Remove lot ${l}`"
              @click="removeLot(l)"
            >
              ✕
            </button>
          </span>
        </div>
        <div class="mt-3 flex gap-2">
          <input v-model="newLot" class="input" aria-label="Add a lot" placeholder="Add a lot…" @keydown.enter.prevent="addLot" />
          <button type="button" class="btn border border-sand bg-white text-ink hover:bg-sand/50" @click="addLot">
            Add
          </button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save parking settings' }}
      </button>
    </form>
  </div>
</template>
