<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { enrollments as api } from '../api';
import StatusPill from '../components/StatusPill.vue';
import {
  fullName,
  sourceLabel,
  oneLineAddress,
  formatDateTime,
  SOURCE_LABELS,
  STATUS_LABELS,
} from '../utils/format';

const router = useRouter();

const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = 20;

const filters = reactive({ q: '', status: '', source: '', from: '', to: '' });

const STATUS_OPTIONS = [
  { v: '', label: 'All statuses' },
  ...Object.entries(STATUS_LABELS).map(([v, label]) => ({ v, label })),
];
const SOURCE_OPTIONS = [
  { v: '', label: 'All sources' },
  ...Object.entries(SOURCE_LABELS).map(([v, label]) => ({ v, label })),
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

async function load() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize, sort: 'created_at', dir: 'desc' };
    for (const k of ['q', 'status', 'source', 'from', 'to']) if (filters[k]) params[k] = filters[k];
    const { data } = await api.list(params);
    rows.value = data.data;
    total.value = data.total;
  } finally {
    loading.value = false;
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

function goTo(p) {
  page.value = p;
  load();
}

function open(id) {
  router.push({ name: 'enrollment-detail', params: { id } });
}

function exportCsv() {
  const params = new URLSearchParams();
  for (const k of ['q', 'status', 'source', 'from', 'to']) if (filters[k]) params.set(k, filters[k]);
  const qs = params.toString();
  window.location.href = '/api/export' + (qs ? `?${qs}` : '');
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-5 flex items-center justify-between gap-3">
      <h1 class="font-serif text-2xl text-ink">Enrollments</h1>
      <button class="btn btn-secondary !py-2" @click="exportCsv">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
        </svg>
        <span class="hidden sm:inline">Export CSV</span>
      </button>
    </div>

    <div class="card mb-4 space-y-3 p-4">
      <input v-model="filters.q" class="input" placeholder="Search name, email, or phone…" />
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select v-model="filters.status" class="input">
          <option v-for="o in STATUS_OPTIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <select v-model="filters.source" class="input">
          <option v-for="o in SOURCE_OPTIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <input v-model="filters.from" type="date" class="input" aria-label="From date" />
        <input v-model="filters.to" type="date" class="input" aria-label="To date" />
      </div>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 5" :key="i" class="h-16 animate-pulse rounded-xl border border-sand bg-white/60" />
    </div>

    <div v-else-if="rows.length === 0" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">No enrollments found</p>
      <p class="mt-1 text-sm text-slate-warm">Try adjusting your filters.</p>
    </div>

    <div v-else class="card divide-y divide-sand overflow-hidden">
      <button
        v-for="e in rows"
        :key="e.id"
        type="button"
        class="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-warm"
        @click="open(e.id)"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-ink">{{ fullName(e) }}</p>
          <p class="truncate text-sm text-slate-warm">
            {{ e.email || e.phone || oneLineAddress(e) || '—' }}
          </p>
        </div>
        <div class="hidden shrink-0 text-right text-xs text-slate-warm sm:block">
          <p>{{ sourceLabel(e.source) }}</p>
          <p>{{ formatDateTime(e.created_at) }}</p>
        </div>
        <StatusPill :status="e.status" />
      </button>
    </div>

    <div v-if="rows.length" class="mt-4 flex items-center justify-between text-sm text-slate-warm">
      <span>{{ total }} total · page {{ page }} of {{ totalPages }}</span>
      <div class="flex gap-2">
        <button class="btn btn-ghost !py-1.5" :disabled="page <= 1" @click="goTo(page - 1)">Prev</button>
        <button class="btn btn-ghost !py-1.5" :disabled="page >= totalPages" @click="goTo(page + 1)">
          Next
        </button>
      </div>
    </div>
  </div>
</template>
