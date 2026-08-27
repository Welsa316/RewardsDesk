<script setup>
import { ref, reactive, onMounted } from 'vue';
import { promos as api } from '../api';
import { useToastStore } from '../stores/toast';
import Modal from '../components/Modal.vue';

const toast = useToastStore();

const rows = ref([]);
const loading = ref(true);
const loadError = ref('');
const storageOk = ref(true);

const editing = ref(null); // the row being edited, or {} for a new one
const busy = ref(false);
const fieldErrors = reactive({});
const form = reactive({ title: '', image_url: '', start_date: '', end_date: '' });
const previewUrl = ref('');
const uploading = ref(false);

function today() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const { data } = await api.list();
    rows.value = data.promos;
    storageOk.value = data.storage_ok !== false;
  } catch (err) {
    if (err?.response?.status === 401) return;
    loadError.value = 'Could not load promos.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openNew() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  Object.assign(form, { title: '', image_url: '', start_date: today(), end_date: today() });
  previewUrl.value = '';
  editing.value = {};
}

function openEdit(p) {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  Object.assign(form, {
    title: p.title,
    image_url: p.image_url,
    start_date: p.start_date.slice(0, 10),
    end_date: p.end_date.slice(0, 10),
  });
  previewUrl.value = p.image_url;
  editing.value = p;
}

async function pickImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast.error('That image is over 5 MB — please use a smaller one.');
    event.target.value = '';
    return;
  }
  uploading.value = true;
  try {
    const { data } = await api.uploadImage(file);
    form.image_url = data.image_url;
    previewUrl.value = data.image_url;
    delete fieldErrors.image_url;
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not upload that image.');
  } finally {
    uploading.value = false;
    event.target.value = '';
  }
}

async function save() {
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  busy.value = true;
  try {
    const payload = { ...form };
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
  if (!window.confirm(`Delete "${p.title}"? The image is removed too and this cannot be undone.`)) return;
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
        <h1 class="font-serif text-2xl text-ink">Promo images</h1>
        <p class="text-sm text-slate-warm">
          Shown on the public home page and above the parking payment form while active.
        </p>
      </div>
      <button class="btn btn-primary !py-2.5" @click="openNew">Add promo</button>
    </div>

    <div
      v-if="!storageOk"
      role="alert"
      class="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <strong>Image storage isn't set up.</strong> Uploads will fail until a volume is attached and
      <code>UPLOAD_DIR</code> points at it.
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-24 animate-pulse rounded-2xl border border-sand bg-white/60" />
    </div>

    <div v-else-if="loadError" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">{{ loadError }}</p>
      <button class="btn btn-secondary mt-4" @click="load">Try again</button>
    </div>

    <div v-else-if="!rows.length" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">No promos yet</p>
      <p class="mt-1 text-sm text-slate-warm">Add one to show an offer to guests.</p>
    </div>

    <ul v-else class="space-y-3">
      <li v-for="p in rows" :key="p.id" class="card flex items-center gap-4 p-3">
        <img :src="p.image_url" :alt="p.title" class="h-16 w-24 shrink-0 rounded-lg border border-sand object-cover" />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium text-ink">{{ p.title }}</p>
          <p class="text-sm text-slate-warm">{{ fmt(p.start_date) }} – {{ fmt(p.end_date) }}</p>
          <span
            class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            :class="p.is_active ? 'bg-green-100 text-green-800' : 'bg-sand text-slate-warm'"
          >
            {{ p.is_active ? 'Live now' : 'Not showing' }}
          </span>
        </div>
        <div class="flex shrink-0 gap-2">
          <button class="btn btn-ghost !py-1.5 text-sm" @click="openEdit(p)">Edit</button>
          <button class="btn !py-1.5 text-sm text-red-700 hover:bg-red-50" @click="remove(p)">Delete</button>
        </div>
      </li>
    </ul>

    <Modal
      v-if="editing"
      :title="editing.id ? 'Edit promo' : 'New promo'"
      :dismissible="false"
      :busy="busy"
      @close="editing = null"
    >
      <form class="space-y-4" novalidate @submit.prevent="save">
        <div>
          <label class="label" for="promo_title">Title</label>
          <input
            id="promo_title"
            v-model="form.title"
            class="input"
            :class="{ 'input-error': fieldErrors.title }"
            placeholder="e.g. Weekend parking special"
          />
          <p v-if="fieldErrors.title" class="field-error">{{ fieldErrors.title }}</p>
        </div>

        <div>
          <label class="label" for="promo_image">Image</label>
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="Selected promo image"
            class="mb-2 max-h-40 w-full rounded-xl border border-sand object-contain"
          />
          <input
            id="promo_image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="input"
            :disabled="uploading"
            @change="pickImage"
          />
          <p class="mt-1 text-xs text-slate-warm">
            {{ uploading ? 'Uploading…' : 'PNG, JPEG, WebP or GIF, up to 5 MB.' }}
          </p>
          <p v-if="fieldErrors.image_url" class="field-error">{{ fieldErrors.image_url }}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="promo_start">Starts</label>
            <input id="promo_start" v-model="form.start_date" type="date" class="input" />
            <p v-if="fieldErrors.start_date" class="field-error">{{ fieldErrors.start_date }}</p>
          </div>
          <div>
            <label class="label" for="promo_end">Ends</label>
            <input id="promo_end" v-model="form.end_date" type="date" class="input" />
            <p v-if="fieldErrors.end_date" class="field-error">{{ fieldErrors.end_date }}</p>
          </div>
        </div>
        <p class="text-xs text-slate-warm">Both dates are inclusive, in the hotel's timezone.</p>

        <div class="flex gap-2 pt-1">
          <button type="button" class="btn btn-ghost flex-1" @click="editing = null">Cancel</button>
          <button type="submit" class="btn btn-primary flex-1" :disabled="busy || uploading">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
