<script setup>
import { ref, computed, onMounted } from 'vue';
import { useStatsStore } from '../stores/stats';
import { useAuthStore } from '../stores/auth';
import StatCard from '../components/StatCard.vue';
import TrendChart from '../components/TrendChart.vue';
import StatusPill from '../components/StatusPill.vue';
import { sourceLabel, timeAgo } from '../utils/format';

const stats = useStatsStore();
const auth = useAuthStore();
const range = ref(30);

const d = computed(() => stats.dashboard);
const trendData = computed(() => (d.value?.trend || []).slice(-range.value));
const maxSource = computed(() => Math.max(1, ...(d.value?.sources || []).map((s) => s.count)));
const firstName = auth.user?.name?.split(' ')[0] ?? '';

onMounted(() => stats.loadDashboard());
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <h1 class="font-serif text-2xl text-ink">Welcome back, {{ firstName }}</h1>
    <p class="text-sm text-slate-warm">Here's how enrollments are tracking.</p>

    <!-- Loading -->
    <div v-if="stats.loading && !d" class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div v-for="i in 4" :key="i" class="h-32 animate-pulse rounded-2xl border border-sand bg-white/60" />
    </div>

    <template v-else-if="d">
      <!-- Stat cards -->
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This month" :value="d.totals.month_enrolled" :goal="d.goals.monthly" />
        <StatCard label="This year" :value="d.totals.year_enrolled" :goal="d.goals.annual" />
        <StatCard label="Pending" :value="d.totals.pending" hint="Waiting in the queue" />
        <StatCard label="Enrolled today" :value="d.totals.today_enrolled" hint="Completed at the desk" />
      </div>

      <!-- Trend -->
      <div class="card mt-4 p-5">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="font-serif text-lg text-ink">Enrollments trend</h2>
            <p class="text-sm text-slate-warm">Last {{ range }} days</p>
          </div>
          <div class="flex rounded-lg border border-sand p-0.5">
            <button
              v-for="r in [30, 90]"
              :key="r"
              type="button"
              class="rounded-md px-3 py-1 text-sm font-medium transition"
              :class="range === r ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
              @click="range = r"
            >
              {{ r }}d
            </button>
          </div>
        </div>
        <div class="mt-4">
          <TrendChart :data="trendData" />
        </div>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <!-- Source breakdown -->
        <div class="card p-5">
          <h2 class="font-serif text-lg text-ink">By source</h2>
          <div v-if="d.sources.length" class="mt-4 space-y-3">
            <div v-for="s in d.sources" :key="s.source">
              <div class="mb-1 flex justify-between text-sm">
                <span class="text-ink">{{ sourceLabel(s.source) }}</span>
                <span class="text-slate-warm">{{ s.count }}</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-sand">
                <div
                  class="h-full rounded-full bg-terracotta"
                  :style="{ width: (s.count / maxSource) * 100 + '%' }"
                />
              </div>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-slate-warm">No submissions yet.</p>
        </div>

        <!-- Recent activity -->
        <div class="card p-5">
          <h2 class="font-serif text-lg text-ink">Recent activity</h2>
          <ul v-if="d.recent.length" class="mt-4 space-y-3">
            <li v-for="(r, i) in d.recent" :key="i" class="flex items-center gap-3 text-sm">
              <StatusPill :status="r.new_status" />
              <span class="min-w-0 flex-1 truncate text-ink">{{ r.first_name }} {{ r.last_name }}</span>
              <span class="shrink-0 text-xs text-slate-warm">
                {{ r.changed_by_name }} · {{ timeAgo(r.changed_at) }}
              </span>
            </li>
          </ul>
          <p v-else class="mt-4 text-sm text-slate-warm">No activity yet.</p>
        </div>
      </div>
    </template>

    <!-- Error -->
    <div v-else-if="stats.error" class="card mt-6 p-6 text-center">
      <p class="text-slate-warm">{{ stats.error }}</p>
      <button class="btn btn-secondary mt-4" @click="stats.loadDashboard()">Retry</button>
    </div>
  </div>
</template>
