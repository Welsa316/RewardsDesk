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

onMounted(load);
async function load() {
  loading.value = true;
  try {
    const { data } = await api.list();
    users.value = data;
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

async function setRole(u, role) {
  if (u.role === role) return;
  try {
    await api.update(u.id, { role });
    u.role = role;
    toast.success(`${u.name} is now ${role}`);
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not change role.');
  }
}

async function toggleActive(u) {
  try {
    if (u.active) await api.deactivate(u.id);
    else await api.update(u.id, { active: true });
    u.active = !u.active;
    toast.success(u.active ? 'Reactivated' : 'Deactivated');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not update.');
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
            @change="setRole(u, $event.target.value)"
          >
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <button
            class="btn border border-sand bg-white !py-1.5 text-sm text-ink hover:bg-sand/50"
            @click="openReset(u)"
          >
            Reset password
          </button>
          <button
            v-if="u.id !== auth.user?.id"
            class="btn !py-1.5 text-sm"
            :class="u.active ? 'border border-sand bg-white text-red-600 hover:bg-red-50' : 'border border-sand bg-white text-ink hover:bg-sand/50'"
            @click="toggleActive(u)"
          >
            {{ u.active ? 'Deactivate' : 'Reactivate' }}
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
