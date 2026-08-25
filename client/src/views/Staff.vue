<script setup>
import { ref, reactive, onMounted } from 'vue';
import { staff as api } from '../api';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import Modal from '../components/Modal.vue';

const auth = useAuthStore();
const toast = useToastStore();

const users = ref([]);
const loading = ref(true);
const loadError = ref('');

onMounted(load);
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.list();
    users.value = data;
  } catch {
    loadError.value = 'Could not load staff.';
  } finally {
    loading.value = false;
  }
}

// Add staff
const showAdd = ref(false);
const addForm = reactive({ name: '', email: '', password: '', role: 'staff' });
const addErrors = reactive({});
const addBusy = ref(false);

function openAdd() {
  Object.assign(addForm, { name: '', email: '', password: '', role: 'staff' });
  Object.keys(addErrors).forEach((k) => delete addErrors[k]);
  showAdd.value = true;
}

async function addStaff() {
  Object.keys(addErrors).forEach((k) => delete addErrors[k]);
  addBusy.value = true;
  try {
    await api.create({ ...addForm });
    showAdd.value = false;
    toast.success('Staff member added');
    load();
  } catch (err) {
    const d = err?.response?.data;
    if (d?.fields) Object.assign(addErrors, d.fields);
    toast.error(d?.error || 'Could not add staff member.');
  } finally {
    addBusy.value = false;
  }
}

// These controls are bound with :value rather than v-model, so when a save
// fails and we leave the row object untouched, Vue has no reason to re-render
// and the DOM keeps showing the value the user picked. For a *role* dropdown
// that means the screen claims a permission level that does not exist. Reload
// the row from the server on failure so the control snaps back.
const busyId = ref(null);

async function revertRow(u) {
  // Replace the row object so the :value-bound nodes re-render from the data
  // (which was never mutated), discarding what the user picked. load() alone
  // is not enough — it swallows its own errors, so an offline reload would
  // leave the stale DOM value sitting there.
  const i = users.value.findIndex((x) => x.id === u.id);
  if (i !== -1) users.value[i] = { ...users.value[i] };
  await load();
}

async function setGoal(u, value) {
  const raw = String(value).trim();
  const goal = raw === '' ? null : Number(raw);
  if (goal !== null && (!Number.isInteger(goal) || goal < 0)) {
    toast.error('Monthly goal must be a whole number.');
    await revertRow(u);
    return;
  }
  if (goal === u.monthly_goal) return;
  try {
    await api.update(u.id, { monthly_goal: goal });
    u.monthly_goal = goal;
    toast.success(goal === null ? `Goal cleared for ${u.name}` : `${u.name}: ${goal}/month`);
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not set the goal.');
    await revertRow(u);
  }
}

async function setRole(u, role) {
  if (u.role === role) return;
  try {
    await api.update(u.id, { role });
    u.role = role;
    toast.success(`${u.name} is now ${role}`);
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not change role.');
    await revertRow(u);
  }
}

async function toggleActive(u) {
  if (busyId.value) return;
  const deactivating = u.active;
  // Deactivation signs someone out immediately and locks them out. A double
  // tap used to fire two DELETEs and flip the local flag twice, so the card
  // said "active" while the database said otherwise — discovered at 6am.
  if (deactivating && !window.confirm(`Deactivate ${u.name}? They'll be signed out and won't be able to log back in.`)) {
    return;
  }
  busyId.value = u.id;
  try {
    if (deactivating) await api.deactivate(u.id);
    else await api.update(u.id, { active: true });
    u.active = !deactivating; // from what we asked for, not from a local negation
    toast.success(deactivating ? `${u.name} deactivated` : `${u.name} reactivated`);
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not update.');
    await revertRow(u);
  } finally {
    busyId.value = null;
  }
}

// Reset password
const resetUser = ref(null);
const resetPasswordValue = ref('');
const resetBusy = ref(false);

function openReset(u) {
  resetUser.value = u;
  resetPasswordValue.value = '';
}

async function resetPassword() {
  resetBusy.value = true;
  try {
    await api.update(resetUser.value.id, { password: resetPasswordValue.value });
    toast.success('Password reset');
    resetUser.value = null;
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not reset password.');
  } finally {
    resetBusy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5 flex items-center justify-between gap-3">
      <h1 class="font-serif text-2xl text-ink">Staff</h1>
      <button class="btn btn-primary !py-2" @click="openAdd">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
        <span class="hidden sm:inline">Add staff</span>
      </button>
    </div>

    <div v-if="loading" class="space-y-2">
      <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-xl border border-sand bg-white/60" />
    </div>

    <div v-else-if="loadError" class="card p-6 text-center">
      <p class="text-slate-warm">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="load">Retry</button>
    </div>

    <div v-else class="space-y-3">
      <div v-for="u in users" :key="u.id" class="card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-ink">
              {{ u.name }}
              <span v-if="u.id === auth.user?.id" class="text-xs text-slate-warm">(you)</span>
            </p>
            <p class="truncate text-sm text-slate-warm">{{ u.email }}</p>
          </div>
          <span
            v-if="!u.active"
            class="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600"
          >
            Inactive
          </span>
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2">
          <select
            :value="u.role"
            class="input !w-auto !py-1.5 text-sm"
            :disabled="u.id === auth.user?.id"
            :aria-label="`Role for ${u.name}`"
            @change="setRole(u, $event.target.value)"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <label class="flex items-center gap-2 text-sm text-slate-warm">
            <span class="whitespace-nowrap">Monthly goal</span>
            <input
              :value="u.monthly_goal ?? ''"
              type="number"
              min="0"
              inputmode="numeric"
              class="input !w-24 !py-1.5 text-sm"
              :aria-label="`Monthly enrollment goal for ${u.name}`"
              placeholder="—"
              @change="setGoal(u, $event.target.value)"
            />
          </label>
          <button
            class="btn border border-sand bg-white !py-1.5 text-sm text-ink hover:bg-sand/50"
            @click="openReset(u)"
          >
            Reset password
          </button>
          <button
            v-if="u.id !== auth.user?.id"
            class="btn !py-1.5 text-sm"
            :class="u.active ? 'border border-sand bg-white text-red-700 hover:bg-red-50' : 'border border-sand bg-white text-ink hover:bg-sand/50'"
            :disabled="busyId === u.id"
            @click="toggleActive(u)"
          >
            {{ busyId === u.id ? 'Working…' : u.active ? 'Deactivate' : 'Reactivate' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Add modal -->
    <Modal v-if="showAdd" title="Add staff member" @close="showAdd = false">
      <form class="space-y-4" novalidate @submit.prevent="addStaff">
        <div>
          <label class="label" for="s_name">Name</label>
          <input id="s_name" v-model="addForm.name" class="input" :class="{ 'input-error': addErrors.name }" />
          <p v-if="addErrors.name" class="field-error">{{ addErrors.name }}</p>
        </div>
        <div>
          <label class="label" for="s_email">Email</label>
          <input id="s_email" v-model="addForm.email" class="input" type="email" :class="{ 'input-error': addErrors.email }" />
          <p v-if="addErrors.email" class="field-error">{{ addErrors.email }}</p>
        </div>
        <div>
          <label class="label" for="s_pw">Temporary password</label>
          <input id="s_pw" v-model="addForm.password" class="input" type="text" :class="{ 'input-error': addErrors.password }" />
          <p v-if="addErrors.password" class="field-error">{{ addErrors.password }}</p>
        </div>
        <div>
          <label class="label" for="s_role">Role</label>
          <select id="s_role" v-model="addForm.role" class="input">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="flex gap-3 pt-1">
          <button type="button" class="btn btn-ghost flex-1" @click="showAdd = false">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" :disabled="addBusy">
            {{ addBusy ? 'Adding…' : 'Add staff' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- Reset password modal -->
    <Modal v-if="resetUser" :title="`Reset password — ${resetUser.name}`" @close="resetUser = null">
      <form class="space-y-4" novalidate @submit.prevent="resetPassword">
        <div>
          <label class="label" for="r_pw">New password</label>
          <input id="r_pw" v-model="resetPasswordValue" class="input" type="text" placeholder="At least 8 characters" />
        </div>
        <div class="flex gap-3">
          <button type="button" class="btn btn-ghost flex-1" @click="resetUser = null">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" :disabled="resetBusy || resetPasswordValue.length < 8">
            {{ resetBusy ? 'Saving…' : 'Set password' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
