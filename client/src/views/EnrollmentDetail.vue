<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { enrollments as api } from '../api';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import StatusPill from '../components/StatusPill.vue';
import CopyAllButton from '../components/CopyAllButton.vue';
import { fullName, sourceLabel, formatDateTime, statusLabel, STATUS_LABELS } from '../utils/format';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const auth = useAuthStore();

const enrollment = ref(null);
const loading = ref(true);
const saving = ref(false);
const form = reactive({ status: '', notes: '' });

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([v, label]) => ({ v, label }));

const addressFull = computed(() => {
  const e = enrollment.value;
  if (!e) return '';
  return [
    e.address_line1,
    e.address_line2,
    [e.city, e.state, e.postal_code].filter(Boolean).join(' '),
    e.country,
  ]
    .filter(Boolean)
    .join(', ');
});

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get(route.params.id);
    enrollment.value = data;
    form.status = data.status;
    form.notes = data.notes || '';
  } catch {
    toast.error('Could not load this record.');
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    await api.patch(route.params.id, { status: form.status, notes: form.notes });
    await load();
    toast.success('Changes saved');
  } catch {
    toast.error('Could not save changes.');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!window.confirm('Delete this record? It will be hidden from all lists and stats.')) return;
  try {
    await api.remove(route.params.id);
    toast.success('Record deleted');
    router.push({ name: 'enrollments' });
  } catch {
    toast.error('Could not delete this record.');
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <button class="mb-4 text-sm font-medium text-terracotta hover:underline" @click="router.back()">
      ← Back
    </button>

    <div v-if="loading" class="h-64 animate-pulse rounded-2xl border border-sand bg-white/60" />

    <div v-else-if="enrollment" class="space-y-4">
      <!-- Header -->
      <div class="card p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="font-serif text-2xl text-ink">{{ fullName(enrollment) }}</h1>
            <p class="mt-1 text-sm text-slate-warm">
              {{ sourceLabel(enrollment.source) }} · added {{ formatDateTime(enrollment.created_at) }}
              <span v-if="enrollment.prefilled"> · prefilled</span>
            </p>
          </div>
          <StatusPill :status="enrollment.status" />
        </div>
        <div class="mt-4">
          <CopyAllButton :enrollment="enrollment" />
        </div>
      </div>

      <!-- Details -->
      <div class="card p-5">
        <h2 class="mb-3 font-serif text-lg text-ink">Details</h2>
        <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">Email</dt>
            <dd class="break-words text-ink">{{ enrollment.email || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">Phone</dt>
            <dd class="text-ink">{{ enrollment.phone || '—' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">Address</dt>
            <dd class="text-ink">{{ addressFull || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">Consent</dt>
            <dd class="text-ink">
              {{ enrollment.consent ? 'Yes' : 'No' }}
              <span v-if="enrollment.consent_at" class="text-slate-warm">
                · {{ formatDateTime(enrollment.consent_at) }}
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm/70">Processed by</dt>
            <dd class="text-ink">
              {{ enrollment.processed_by_name || '—' }}
              <span v-if="enrollment.processed_at" class="text-slate-warm">
                · {{ formatDateTime(enrollment.processed_at) }}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <!-- Update -->
      <div class="card p-5">
        <h2 class="mb-3 font-serif text-lg text-ink">Update</h2>
        <label class="label" for="status">Status</label>
        <select id="status" v-model="form.status" class="input mb-3">
          <option v-for="o in STATUS_OPTIONS" :key="o.v" :value="o.v">{{ o.label }}</option>
        </select>
        <label class="label" for="notes">Notes</label>
        <textarea id="notes" v-model="form.notes" rows="3" class="input" placeholder="Internal notes…" />
        <button class="btn btn-primary mt-3" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>

      <!-- History -->
      <div class="card p-5">
        <h2 class="mb-3 font-serif text-lg text-ink">Status history</h2>
        <ol v-if="enrollment.history?.length" class="space-y-3">
          <li v-for="h in enrollment.history" :key="h.id" class="flex items-start gap-3">
            <div class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta" />
            <div class="text-sm">
              <p class="text-ink">
                <span v-if="h.old_status">{{ statusLabel(h.old_status) }} → </span>
                <span class="font-medium">{{ statusLabel(h.new_status) }}</span>
              </p>
              <p class="text-xs text-slate-warm">
                {{ h.changed_by_name || 'System' }} · {{ formatDateTime(h.changed_at) }}
              </p>
            </div>
          </li>
        </ol>
        <p v-else class="text-sm text-slate-warm">No status changes yet.</p>
      </div>

      <div v-if="auth.isAdmin" class="pt-1 text-center">
        <button class="text-sm font-medium text-red-600 hover:underline" @click="remove">
          Delete this record
        </button>
      </div>
    </div>
  </div>
</template>
