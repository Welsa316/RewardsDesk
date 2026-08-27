<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { parking, parkingPublic } from '../api';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { formatPlate } from '../utils/states';
import ParkingStatusPill from '../components/ParkingStatusPill.vue';
import ParkingSessionModal from '../components/ParkingSessionModal.vue';
import NewParkingSessionModal from '../components/NewParkingSessionModal.vue';
import { formatMoney, formatDateTime, timeAgo } from '../utils/format';

const toast = useToastStore();
const auth = useAuthStore();
const route = useRoute();

const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const loadError = ref('');
const page = ref(1);
const pageSize = 25;

// Deep-linkable status filter (the dashboard's Expired card links here).
const filters = reactive({
  q: '',
  status: typeof route.query.status === 'string' ? route.query.status : '',
});

const STATUS_TABS = [
  { v: '', label: 'All' },
  { v: 'active', label: 'Active' },
  { v: 'expiring_soon', label: 'Expiring soon' },
  { v: 'expired', label: 'Expired' },
  { v: 'departed', label: 'Departed' },
  { v: 'complimentary', label: 'Comp' },
];

const KIND_LABELS = { online: 'Online', desk: 'Desk', comp: 'Comp' };

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

const selectedId = ref(null);
const showNew = ref(false);
const rates = ref(null);

let loadSeq = 0;

async function load() {
  loading.value = true;
  loadError.value = '';
  const mine = ++loadSeq;
  try {
    const params = { page: page.value, pageSize };
    if (filters.q) params.q = filters.q;
    if (filters.status) params.status = filters.status;
    const { data } = await parking.sessions(params);
    // Typing "ABC" then "1234" fires two requests; if the first is slower it
    // would land last and leave the list showing matches for "ABC" while the
    // box reads "ABC1234". At a desk that is checking out the wrong car.
    if (mine !== loadSeq) return;
    rows.value = data.data;
    total.value = data.total;
  } catch (err) {
    if (mine !== loadSeq) return;
    if (err?.response?.status === 401) return;
    loadError.value = 'Could not load parking sessions.';
    rows.value = [];
    total.value = 0;
  } finally {
    if (mine === loadSeq) loading.value = false;
  }
}

let debounce;
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      page.value = 1;
      load();
    }, 300);
  },
  { deep: true },
);
onBeforeUnmount(() => clearTimeout(debounce));

function goTo(p) {
  page.value = p;
  load();
}

function onCreated(session) {
  showNew.value = false;
  toast.success(`${session.confirmation_code} created for ${session.plate}`);
  load();
}

onMounted(async () => {
  load();
  try {
    const { data } = await parkingPublic.config();
    rates.value = { daily_cents: data.daily_cents };
  } catch {
    // new-session modal will show a rates error if opened
  }
});
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-5 flex items-center justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl text-ink">Parking sessions</h1>
        <p class="text-sm text-slate-warm">{{ total }} vehicle{{ total === 1 ? '' : 's' }} on record</p>
      </div>
      <button v-if="auth.isAdmin" class="btn btn-primary !py-2.5" aria-label="New parking session" @click="showNew = true">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
        <span class="hidden sm:inline">New session</span>
      </button>
    </div>

    <input
      v-model="filters.q"
      class="input mb-3"
      aria-label="Search parking sessions"
      placeholder="Search plate, name, phone, or confirmation #…"
    />

    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="t in STATUS_TABS"
        :key="t.v"
        type="button"
        class="rounded-full border px-3 py-1.5 text-sm font-medium transition"
        :class="
          filters.status === t.v
            ? 'border-ink bg-ink text-white'
            : 'border-sand bg-white text-slate-warm hover:text-ink'
        "
        @click="filters.status = t.v"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 4" :key="i" class="h-20 animate-pulse rounded-xl border border-sand bg-white/60" />
    </div>

    <div v-else-if="loadError" class="card p-6 text-center">
      <p class="text-slate-warm">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="load">Retry</button>
    </div>

    <div v-else-if="rows.length === 0" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">No parking sessions found</p>
      <p class="mt-1 text-sm text-slate-warm">
        {{ filters.q || filters.status ? 'Try different filters.' : 'Paid sessions appear here as guests check in.' }}
      </p>
    </div>

    <div v-else class="card divide-y divide-sand overflow-hidden">
      <button
        v-for="s in rows"
        :key="s.id"
        type="button"
        class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-warm"
        @click="selectedId = s.id"
      >
        <div class="min-w-0 flex-1">
          <p class="font-medium text-ink">
            <span class="font-semibold uppercase">{{ formatPlate(s.plate, s.plate_state) }}</span>
            <span class="text-slate-warm"> · {{ s.guest_name }}</span>
            <span v-if="s.room" class="text-slate-warm"> · Rm {{ s.room }}</span>
          </p>
          <p class="truncate text-sm text-slate-warm">
            {{ s.vehicle_desc || KIND_LABELS[s.kind] }} · in {{ timeAgo(s.starts_at || s.created_at) }}
            <template v-if="s.paid_through"> · until {{ formatDateTime(s.paid_through) }}</template>
          </p>
        </div>
        <span class="text-sm font-medium text-ink">{{ formatMoney(s.net_paid_cents) }}</span>
        <ParkingStatusPill :status="s.status" />
      </button>
    </div>

    <div v-if="rows.length" class="mt-4 flex items-center justify-between text-sm text-slate-warm">
      <span>{{ total }} total · page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-2">
        <button class="btn btn-ghost !py-1.5" :disabled="page <= 1" @click="goTo(page - 1)">Prev</button>
        <button class="btn btn-ghost !py-1.5" :disabled="page >= totalPages" @click="goTo(page + 1)">Next</button>
      </div>
    </div>

    <ParkingSessionModal
      v-if="selectedId"
      :session-id="selectedId"
      :rates="rates"
      @close="selectedId = null"
      @changed="load"
    />
    <NewParkingSessionModal v-if="showNew" :rates="rates" @close="showNew = false" @created="onCreated" />
  </div>
</template>
