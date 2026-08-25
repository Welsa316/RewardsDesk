<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { enrollments as api } from '../api';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import StatusPill from '../components/StatusPill.vue';
import QualificationPill from '../components/QualificationPill.vue';
import CopyAllButton from '../components/CopyAllButton.vue';
import { fullName, sourceLabel, formatDateTime, auditSentence, STATUS_LABELS } from '../utils/format';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const auth = useAuthStore();

const enrollment = ref(null);
const loadError = ref('');
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
  loadError.value = '';
  try {
    const { data } = await api.get(route.params.id);
    enrollment.value = data;
    form.status = data.status;
    form.notes = data.notes || '';
  } catch (err) {
    if (err?.response?.status === 401) return; // interceptor is redirecting
    loadError.value =
      err?.response?.status === 404
        ? 'This record no longer exists — it may have been deleted.'
        : 'Could not load this record.';
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

// Qualification is the outcome Best Western reports back — admin only.
const qualifying = ref(false);
async function setQualification(value) {
  qualifying.value = true;
  try {
    await api.patch(route.params.id, { qualification: value });
    await load();
    toast.success(value ? `Marked ${value}` : 'Qualification cleared');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not update qualification.');
  } finally {
    qualifying.value = false;
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
    <button class="mb-4 text-sm font-medium text-terracotta-700 hover:underline" @click="router.back()">
      ← Back
    </button>

    <div v-if="loading" class="h-64 animate-pulse rounded-2xl border border-sand bg-white/60" />

    <!-- Without this the page was simply blank: a v-if/v-else-if pair with no
         else, so a deleted record or a transient 500 rendered nothing at all. -->
    <div v-else-if="loadError" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">{{ loadError }}</p>
      <div class="mt-4 flex justify-center gap-2">
        <button class="btn btn-secondary" @click="load">Try again</button>
        <RouterLink to="/enrollments" class="btn btn-ghost">Back to enrollments</RouterLink>
      </div>
    </div>

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
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <StatusPill :status="enrollment.status" />
            <QualificationPill v-if="enrollment.status === 'enrolled'" :qualification="enrollment.qualification" />
          </div>
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
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Email</dt>
            <dd class="break-words text-ink">{{ enrollment.email || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Phone</dt>
            <dd class="text-ink">{{ enrollment.phone || '—' }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Address</dt>
            <dd class="text-ink">{{ addressFull || '—' }}</dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Consent</dt>
            <dd class="text-ink">
              {{ enrollment.consent ? 'Yes' : 'No' }}
              <span v-if="enrollment.consent_at" class="text-slate-warm">
                · {{ formatDateTime(enrollment.consent_at) }}
              </span>
            </dd>
          </div>
          <div>
            <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Processed by</dt>
            <dd class="text-ink">
              {{ enrollment.processed_by_name || '—' }}
              <span v-if="enrollment.processed_at" class="text-slate-warm">
                · {{ formatDateTime(enrollment.processed_at) }}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <!-- Qualification (admin) -->
      <div v-if="auth.isAdmin && enrollment.status === 'enrolled'" class="card p-5">
        <h2 class="font-serif text-lg text-ink">Best Western qualification</h2>
        <p class="mb-3 mt-1 text-sm text-slate-warm">
          Record the outcome once Best Western confirms whether this enrollment counted
          for the property.
          <span v-if="enrollment.qualified_by_name" class="block">
            Last set by {{ enrollment.qualified_by_name }} · {{ formatDateTime(enrollment.qualified_at) }}
          </span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            class="btn !py-2"
            :class="enrollment.qualification === 'qualified' ? 'btn-primary' : 'border border-sand bg-white text-ink hover:bg-sand/50'"
            :disabled="qualifying"
            @click="setQualification('qualified')"
          >
            Qualified
          </button>
          <button
            class="btn !py-2"
            :class="enrollment.qualification === 'disqualified' ? 'btn-secondary' : 'border border-sand bg-white text-ink hover:bg-sand/50'"
            :disabled="qualifying"
            @click="setQualification('disqualified')"
          >
            Disqualified
          </button>
          <button
            v-if="enrollment.qualification"
            class="btn btn-ghost !py-2"
            :disabled="qualifying"
            @click="setQualification(null)"
          >
            Clear
          </button>
        </div>
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

      <!-- Audit trail -->
      <div class="card p-5">
        <h2 class="mb-3 font-serif text-lg text-ink">History</h2>
        <ol v-if="enrollment.history?.length" class="space-y-3">
          <li v-for="h in enrollment.history" :key="h.id" class="flex items-start gap-3">
            <div
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="h.action === 'qualification' ? 'bg-green-600' : h.action === 'created' ? 'bg-ink' : 'bg-terracotta'"
            />
            <div class="text-sm">
              <p class="font-medium text-ink">{{ auditSentence(h) }}</p>
              <p class="text-xs text-slate-warm">
                {{ h.changed_by_name || 'System' }} · {{ formatDateTime(h.changed_at) }}
              </p>
            </div>
          </li>
        </ol>
        <p v-else class="text-sm text-slate-warm">No activity yet.</p>
      </div>

      <div v-if="auth.isAdmin" class="pt-1 text-center">
        <button class="text-sm font-medium text-red-700 hover:underline" @click="remove">
          Delete this record
        </button>
      </div>
    </div>
  </div>
</template>
