<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useSettingsStore } from '../stores/settings';
import { useToastStore } from '../stores/toast';

const store = useSettingsStore();
const toast = useToastStore();

const form = reactive({
  hotel_name: '',
  property_code: '',
  monthly_goal: 0,
  annual_goal: 0,
  sources: [],
});
const newSource = ref('');
const loading = ref(true);
const saving = ref(false);

onMounted(async () => {
  await store.load();
  if (store.data) {
    Object.assign(form, {
      hotel_name: store.data.hotel_name,
      property_code: store.data.property_code,
      monthly_goal: store.data.monthly_goal,
      annual_goal: store.data.annual_goal,
      sources: [...(store.data.sources || [])],
    });
  }
  loading.value = false;
});

function addSource() {
  const s = newSource.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (s && !form.sources.includes(s)) form.sources.push(s);
  newSource.value = '';
}

function removeSource(s) {
  form.sources = form.sources.filter((x) => x !== s);
}

async function save() {
  saving.value = true;
  try {
    await store.save({
      hotel_name: form.hotel_name,
      property_code: form.property_code,
      monthly_goal: Number(form.monthly_goal),
      annual_goal: Number(form.annual_goal),
      sources: form.sources,
    });
    toast.success('Settings saved');
  } catch {
    toast.error('Could not save settings.');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <h1 class="font-serif text-2xl text-ink">Settings</h1>
    <p class="text-sm text-slate-warm">Hotel details, enrollment goals, and intake sources.</p>

    <div v-if="loading" class="mt-6 h-96 animate-pulse rounded-2xl border border-sand bg-white/60" />

    <form v-else class="mt-6 space-y-4" novalidate @submit.prevent="save">
      <div class="card space-y-4 p-5">
        <div>
          <label class="label" for="hotel_name">Hotel name</label>
          <input id="hotel_name" v-model="form.hotel_name" class="input" />
        </div>
        <div>
          <label class="label" for="property_code">Property code</label>
          <input id="property_code" v-model="form.property_code" class="input" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="label" for="monthly_goal">Monthly goal</label>
            <input id="monthly_goal" v-model.number="form.monthly_goal" type="number" min="0" inputmode="numeric" class="input" />
          </div>
          <div>
            <label class="label" for="annual_goal">Annual goal</label>
            <input id="annual_goal" v-model.number="form.annual_goal" type="number" min="0" inputmode="numeric" class="input" />
          </div>
        </div>
      </div>

      <div class="card p-5">
        <label class="label">Intake sources</label>
        <p class="mb-3 text-xs text-slate-warm">
          Used for QR tags and source tracking. Lowercase, no spaces (e.g. <code>qr-pool</code>).
        </p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="s in form.sources"
            :key="s"
            class="inline-flex items-center gap-1.5 rounded-full bg-sand/70 py-1 pl-3 pr-1.5 text-sm text-ink"
          >
            {{ s }}
            <button
              type="button"
              class="flex h-5 w-5 items-center justify-center rounded-full text-slate-warm hover:bg-ink/10 hover:text-ink"
              aria-label="Remove"
              @click="removeSource(s)"
            >
              ✕
            </button>
          </span>
        </div>
        <div class="mt-3 flex gap-2">
          <input
            v-model="newSource"
            class="input"
            placeholder="Add a source…"
            @keydown.enter.prevent="addSource"
          />
          <button type="button" class="btn border border-sand bg-white text-ink hover:bg-sand/50" @click="addSource">
            Add
          </button>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="saving">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </form>
  </div>
</template>
