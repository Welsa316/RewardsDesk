<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { stats as api } from '../api';

const rows = ref([]);
// Starts true so the skeleton (not the empty state) shows until the first
// debounced load completes.
const loading = ref(true);
const loaded = ref(false);
const loadError = ref('');
const range = reactive({ from: '', to: '' });
const activePreset = ref('month');

const maxEnrolled = computed(() => Math.max(1, ...rows.value.map((r) => r.enrolled)));
const totalEnrolled = computed(() => rows.value.reduce((s, r) => s + r.enrolled, 0));

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function preset(kind) {
  activePreset.value = kind;
  const now = new Date();
  if (kind === 'month') {
    range.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    range.to = ymd(now);
  } else if (kind === 'year') {
    range.from = ymd(new Date(now.getFullYear(), 0, 1));
    range.to = ymd(now);
  } else {
    range.from = '';
    range.to = '';
  }
}

// Convert a local YYYY-MM-DD into exact instants so the range matches the
// viewer's calendar regardless of the server's timezone. `to` is inclusive of
// the selected day, so its upper bound is local midnight of the next day.
function startInstant(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
function endInstant(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

let loadSeq = 0;

async function load() {
  loading.value = true;
  const mine = ++loadSeq;
  try {
    const params = {};
    if (range.from) params.from = startInstant(range.from);
    if (range.to) params.to = endInstant(range.to);
    const { data } = await api.leaderboard(params);
    if (mine !== loadSeq) return; // a newer range change already won
    rows.value = data.rows;
    loadError.value = '';
    loaded.value = true;
  } catch (err) {
    if (mine !== loadSeq) return;
    if (err?.response?.status === 401) return; // interceptor is redirecting
    // There was no catch here at all, so a failure left loading false and
    // loaded false — every branch fell through to the final v-else and the
    // owner saw an empty card, which reads as "nobody enrolled anyone".
    loadError.value = 'Could not load the leaderboard.';
    rows.value = [];
  } finally {
    if (mine === loadSeq) loading.value = false;
  }
}

let debounce;
// The initial preset() below mutates `range`, which would otherwise schedule a
// debounced load and put 250ms of latency in front of the page's own first
// paint. Skip that one trigger and load directly instead.
let primed = false;
watch(
  () => ({ ...range }),
  () => {
    clearTimeout(debounce);
    if (!primed) return;
    debounce = setTimeout(load, 250);
  },
  { deep: true },
);
onBeforeUnmount(() => clearTimeout(debounce));

onMounted(async () => {
  preset('month');
  load();
  await nextTick();
  primed = true;
});
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <h1 class="font-serif text-2xl text-ink">Leaderboard</h1>
    <p class="text-sm text-slate-warm">Enrollments completed by each agent.</p>

    <!-- Range controls -->
    <div class="card mt-5 flex flex-wrap items-center gap-3 p-4">
      <div class="flex rounded-lg border border-sand p-0.5">
        <button
          v-for="p in [
            { k: 'month', label: 'This month' },
            { k: 'year', label: 'This year' },
            { k: 'all', label: 'All time' },
          ]"
          :key="p.k"
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium transition"
          :class="activePreset === p.k ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
          @click="preset(p.k)"
        >
          {{ p.label }}
        </button>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <input
          v-model="range.from"
          type="date"
          class="input !py-1.5"
          aria-label="From"
          @change="activePreset = 'custom'"
        />
        <span class="text-slate-warm">to</span>
        <input
          v-model="range.to"
          type="date"
          class="input !py-1.5"
          aria-label="To"
          @change="activePreset = 'custom'"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !loaded" class="mt-4 space-y-3">
      <div v-for="i in 3" :key="i" class="h-16 animate-pulse rounded-xl border border-sand bg-white/60" />
    </div>

    <!-- Failed -->
    <div v-else-if="loadError" class="card mt-4 p-10 text-center">
      <p class="font-serif text-lg text-ink">{{ loadError }}</p>
      <p class="mt-1 text-sm text-slate-warm">These figures are missing, not zero.</p>
      <button class="btn btn-secondary mt-4" @click="load">Try again</button>
    </div>

    <!-- Empty -->
    <div v-else-if="loaded && rows.length === 0" class="card mt-4 p-10 text-center">
      <p class="text-slate-warm">No staff to show yet.</p>
    </div>

    <!-- Leaderboard -->
    <div v-else class="card mt-4 divide-y divide-sand p-2">
      <div v-for="(r, i) in rows" :key="r.id" class="flex items-center gap-4 p-3">
        <span class="w-6 shrink-0 text-center font-serif text-lg text-slate-warm">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate font-medium text-ink">{{ r.name }}</span>
            <span class="shrink-0 text-sm text-slate-warm">
              <span class="font-semibold text-ink">{{ r.enrolled }}</span> enrolled · {{ r.conversion }}%
            </span>
          </div>
          <div class="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-sand">
            <div
              class="h-full rounded-full bg-terracotta transition-all duration-500"
              :style="{ width: (r.enrolled / maxEnrolled) * 100 + '%' }"
            />
          </div>
          <p class="mt-1 text-xs text-slate-warm">
            {{ r.processed }} processed · {{ r.qualified }} qualified ·
            today {{ r.today }} · MTD {{ r.month_enrolled }} · YTD {{ r.year_enrolled }}
          </p>
          <p v-if="r.monthly_goal" class="mt-0.5 text-xs" :class="r.goal_remaining === 0 ? 'text-green-700' : 'text-slate-warm'">
            Monthly goal {{ r.month_enrolled }}/{{ r.monthly_goal }} ({{ r.goal_pct }}%)
            <template v-if="r.goal_remaining > 0"> · {{ r.goal_remaining }} to go</template>
            <template v-else> · goal met</template>
          </p>
        </div>
      </div>
    </div>

    <p v-if="loaded && rows.length" class="mt-3 text-center text-sm text-slate-warm">
      {{ totalEnrolled }} enrolled in this period
    </p>
  </div>
</template>
