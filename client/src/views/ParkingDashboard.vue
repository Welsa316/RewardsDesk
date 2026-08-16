<script setup>
import { ref, reactive, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { parking } from '../api';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import StatCard from '../components/StatCard.vue';
import { formatMoney } from '../utils/format';

const auth = useAuthStore();
const toast = useToastStore();

const dash = ref(null);
const revenue = ref(null);
const loadError = ref('');
const range = reactive({ from: '', to: '' });

function startInstant(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function endInstant(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function load() {
  loadError.value = '';
  try {
    const params = {};
    if (range.from) params.from = startInstant(range.from);
    if (range.to) params.to = endInstant(range.to);
    const [d, r] = await Promise.all([parking.dashboard(), parking.revenue(params)]);
    dash.value = d.data;
    revenue.value = r.data;
  } catch {
    loadError.value = 'Could not load the parking dashboard.';
  }
}
onMounted(load);

function exportCsv() {
  window.location.href = '/api/parking/export';
}

async function applyRange() {
  try {
    const params = {};
    if (range.from) params.from = startInstant(range.from);
    if (range.to) params.to = endInstant(range.to);
    const { data } = await parking.revenue(params);
    revenue.value = data;
  } catch {
    toast.error('Could not load revenue for that range.');
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <h1 class="font-serif text-2xl text-ink">Parking</h1>
    <p class="text-sm text-slate-warm">Lot occupancy and revenue at a glance.</p>

    <div v-if="loadError" class="card mt-6 p-6 text-center">
      <p class="text-slate-warm">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="load">Retry</button>
    </div>

    <div v-else-if="!dash" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="h-28 animate-pulse rounded-2xl border border-sand bg-white/60" />
    </div>

    <template v-else>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vehicles on lot" :value="dash.occupying" :hint="`${dash.available} of ${dash.capacity} spaces free`" />
        <StatCard label="Leaving today" :value="dash.leaving_today" hint="Paid through today" />
        <RouterLink :to="{ name: 'parking-sessions', query: { status: 'expired' } }" class="block">
          <StatCard label="Expired / overdue" :value="dash.expired" hint="Tap to view" />
        </RouterLink>
        <StatCard label="Revenue today" :value="formatMoney(dash.revenue_today_cents)" hint="Net of refunds" />
      </div>

      <div v-if="revenue" class="card mt-4 p-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="font-serif text-lg text-ink">Revenue</h2>
            <p class="text-sm text-slate-warm">
              Today {{ formatMoney(revenue.buckets.today_cents) }} ·
              This week {{ formatMoney(revenue.buckets.week_cents) }} ·
              This month {{ formatMoney(revenue.buckets.month_cents) }}
            </p>
          </div>
          <button v-if="auth.isAdmin" class="btn btn-secondary !py-2" aria-label="Export sessions CSV" @click="exportCsv">
            Export CSV
          </button>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <input v-model="range.from" type="date" class="input !w-auto !py-1.5" aria-label="From date" @change="applyRange" />
          <span class="text-slate-warm">to</span>
          <input v-model="range.to" type="date" class="input !w-auto !py-1.5" aria-label="To date" @change="applyRange" />
          <span class="text-slate-warm">(blank = all time)</span>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Net revenue</dt>
            <dd class="font-serif text-xl text-ink">{{ formatMoney(revenue.range.net_cents) }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Paid vehicles</dt>
            <dd class="font-serif text-xl text-ink">{{ revenue.range.paid_vehicles }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Avg transaction</dt>
            <dd class="font-serif text-xl text-ink">{{ formatMoney(revenue.range.avg_transaction_cents) }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Avg stay</dt>
            <dd class="font-serif text-xl text-ink">{{ revenue.range.avg_stay_hours }}h</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Hourly vs daily</dt>
            <dd class="text-ink">
              {{ formatMoney(revenue.range.hourly_cents) }} / {{ formatMoney(revenue.range.daily_cents) }}
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Refunded</dt>
            <dd class="text-ink">{{ formatMoney(revenue.range.refunds_cents) }}</dd>
          </div>
        </dl>
      </div>
    </template>
  </div>
</template>
