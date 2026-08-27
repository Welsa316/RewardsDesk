<script setup>
import { ref, reactive, onMounted } from 'vue';
import { parkingPromos as api } from '../api';
import { useToastStore } from '../stores/toast';
import { formatMoney } from '../utils/format';
import Modal from '../components/Modal.vue';

const toast = useToastStore();

const rows = ref([]);
const standardCents = ref(0);
const loading = ref(true);
const loadError = ref('');

const editing = ref(null);
const busy = ref(false);
const fieldErrors = reactive({});
const form = reactive({ name: '', rate_dollars: '', start_date: '', end_date: '' });

function today() {
  return new Date().toLocaleDateString('en-CA');
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.list();
    rows.value = data.promos;
    standardCents.value = data.standard_daily_cents;
  } catch (err) {
    if (err?.response?.status === 401) return;
    loadError.value = 'Could not load parking promos.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openNew() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  Object.assign(form, { name: '', rate_dollars: '', start_date: today(), end_date: today() });
  editing.value = {};
}

function openEdit(p) {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  Object.assign(form, {
    name: p.name,
    rate_dollars: (p.rate_cents / 100).toFixed(2),
    start_date: p.start_date.slice(0, 10),
    end_date: p.end_date.slice(0, 10),
  });
  editing.value = p;
}

async function save() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);

  // Parse here rather than sending a raw string: "$15" or "15,00" become NaN,
  // and a NaN reaching the server as JSON null would be read as "no value".
  const raw = String(form.rate_dollars).trim().replace(/^\$/, '');
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n) || n <= 0) {
    fieldErrors.rate_cents = 'Enter a rate like 15.00.';
    return;
  }
  const rate_cents = Math.round(n * 100);

  busy.value = true;
  try {
    const payload = {
      name: form.name,
      rate_cents,
      start_date: form.start_date,
      end_date: form.end_date,
    };
    if (editing.value.id) await api.update(editing.value.id, payload);
    else await api.create(payload);
    toast.success(editing.value.id ? 'Promo updated' : 'Promo created');
    editing.value = null;
    await load();
  } catch (err) {
    const d = err?.response?.data;
    if (d?.fields) Object.assign(fieldErrors, d.fields);
    toast.error(d?.error || 'Could not save the promo.');
  } finally {
    busy.value = false;
  }
}

async function remove(p) {
  if (!window.confirm(`Delete "${p.name}"? Parking goes back to the standard rate for those dates.`)) return;
  try {
    await api.remove(p.id);
    toast.success('Promo deleted');
    await load();
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not delete the promo.');
  }
}

function fmt(d) {
  return new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5 flex items-center justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl text-ink">Parking rate promos</h1>
        <p class="text-sm text-slate-warm">
          A special daily rate for a date range. Standard rate is
          <strong class="text-ink">{{ formatMoney(standardCents) }}/day</strong>.
        </p>
      </div>
      <button class="btn btn-primary !py-2.5" @click="openNew">Add promo</button>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-2xl border border-sand bg-white/60" />
    </div>

    <div v-else-if="loadError" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="load">Try again</button>
    </div>

    <div v-else-if="!rows.length" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">No rate promos</p>
      <p class="mt-1 text-sm text-slate-warm">Parking is charged at the standard daily rate.</p>
    </div>

    <ul v-else class="space-y-3">
      <li v-for="p in rows" :key="p.id" class="card flex items-center gap-4 p-4">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-ink">{{ p.name }}</p>
          <p class="text-sm text-slate-warm">{{ fmt(p.start_date) }} – {{ fmt(p.end_date) }}</p>
          <span
            class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            :class="p.is_active ? 'bg-green-100 text-green-800' : 'bg-sand text-slate-warm'"
          >
            {{ p.is_active ? 'Live now' : 'Not active' }}
          </span>
        </div>
        <p
          class="shrink-0 font-serif text-xl"
          style="font-variant-numeric: tabular-nums"
          :class="p.rate_cents < standardCents ? 'text-ink' : 'text-slate-warm'"
        >
          {{ formatMoney(p.rate_cents) }}<span class="text-sm text-slate-warm">/day</span>
        </p>
        <div class="flex shrink-0 gap-2">
          <button class="btn btn-ghost !py-1.5 text-sm" @click="openEdit(p)">Edit</button>
          <button class="btn !py-1.5 text-sm text-red-700 hover:bg-red-50" @click="remove(p)">Delete</button>
        </div>
      </li>
    </ul>

    <p v-if="rows.length" class="mt-4 text-xs text-slate-warm">
      Where two promos overlap, guests are charged the lower of the two. A promo priced at or above
      the standard rate is ignored rather than applied.
    </p>

    <Modal
      v-if="editing"
      :title="editing.id ? 'Edit rate promo' : 'New rate promo'"
      :dismissible="false"
      :busy="busy"
      @close="editing = null"
    >
      <form class="space-y-4" novalidate @submit.prevent="save">
        <div>
          <label class="label" for="pp_name">Name</label>
          <input
            id="pp_name"
            v-model="form.name"
            class="input"
            :class="{ 'input-error': fieldErrors.name }"
            placeholder="e.g. Mardi Gras rate"
          />
          <p v-if="fieldErrors.name" class="field-error">{{ fieldErrors.name }}</p>
          <p class="mt-1 text-xs text-slate-warm">Guests see this name on the payment page.</p>
        </div>

        <div>
          <label class="label" for="pp_rate">Daily rate ($)</label>
          <input
            id="pp_rate"
            v-model="form.rate_dollars"
            class="input"
            :class="{ 'input-error': fieldErrors.rate_cents }"
            inputmode="decimal"
            placeholder="15.00"
          />
          <p v-if="fieldErrors.rate_cents" class="field-error">{{ fieldErrors.rate_cents }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="pp_start">Starts</label>
            <input id="pp_start" v-model="form.start_date" type="date" class="input" />
            <p v-if="fieldErrors.start_date" class="field-error">{{ fieldErrors.start_date }}</p>
          </div>
          <div>
            <label class="label" for="pp_end">Ends</label>
            <input id="pp_end" v-model="form.end_date" type="date" class="input" />
            <p v-if="fieldErrors.end_date" class="field-error">{{ fieldErrors.end_date }}</p>
          </div>
        </div>
        <p class="text-xs text-slate-warm">
          Both dates inclusive, in the hotel's timezone. Sessions already paid for are not repriced.
        </p>

        <div class="flex gap-2 pt-1">
          <button type="button" class="btn btn-ghost flex-1" @click="editing = null">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" :disabled="busy">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
