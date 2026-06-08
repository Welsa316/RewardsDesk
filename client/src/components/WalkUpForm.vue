<script setup>
import { reactive, ref, computed } from 'vue';
import Modal from './Modal.vue';
import AddressFields from './AddressFields.vue';
import { useEnrollmentsStore } from '../stores/enrollments';

const emit = defineEmits(['close', 'created']);
const store = useEnrollmentsStore();

const form = reactive({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  consent: false,
});
const enrolledNow = ref(true);
const submitting = ref(false);
const formError = ref('');
const fieldErrors = reactive({});

const canSubmit = computed(() => form.consent && !submitting.value);

async function submit() {
  formError.value = '';
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  if (!form.first_name.trim()) fieldErrors.first_name = 'Required.';
  if (!form.last_name.trim()) fieldErrors.last_name = 'Required.';
  if (Object.keys(fieldErrors).length) return;

  submitting.value = true;
  try {
    const data = await store.createWalkUp({
      ...form,
      source: 'front-desk',
      status: enrolledNow.value ? 'enrolled' : 'pending',
    });
    emit('created', data);
  } catch (err) {
    const d = err?.response?.data;
    if (d?.fields) Object.assign(fieldErrors, d.fields);
    formError.value = d?.error || 'Could not save. Please try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal title="Add walk-up enrollment" @close="emit('close')">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p
        v-if="formError"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ formError }}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="wu_first">First name</label>
          <input
            id="wu_first"
            v-model="form.first_name"
            class="input"
            :class="{ 'input-error': fieldErrors.first_name }"
            autocomplete="given-name"
          />
          <p v-if="fieldErrors.first_name" class="field-error">{{ fieldErrors.first_name }}</p>
        </div>
        <div>
          <label class="label" for="wu_last">Last name</label>
          <input
            id="wu_last"
            v-model="form.last_name"
            class="input"
            :class="{ 'input-error': fieldErrors.last_name }"
            autocomplete="family-name"
          />
          <p v-if="fieldErrors.last_name" class="field-error">{{ fieldErrors.last_name }}</p>
        </div>
      </div>

      <div>
        <label class="label" for="wu_email">Email</label>
        <input
          id="wu_email"
          v-model="form.email"
          class="input"
          :class="{ 'input-error': fieldErrors.email }"
          type="email"
          inputmode="email"
          autocomplete="email"
        />
        <p v-if="fieldErrors.email" class="field-error">{{ fieldErrors.email }}</p>
      </div>

      <div>
        <label class="label" for="wu_phone">Phone</label>
        <input
          id="wu_phone"
          v-model="form.phone"
          class="input"
          :class="{ 'input-error': fieldErrors.phone }"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
        />
        <p v-if="fieldErrors.phone" class="field-error">{{ fieldErrors.phone }}</p>
      </div>

      <AddressFields :form="form" :errors="fieldErrors" />

      <label class="flex cursor-pointer items-start gap-3">
        <input
          v-model="form.consent"
          type="checkbox"
          class="mt-0.5 h-5 w-5 shrink-0 rounded border-sand text-terracotta focus:ring-terracotta/40"
        />
        <span class="text-sm text-slate-warm">
          The guest authorizes enrollment in Best Western Rewards and contact about their membership.
        </span>
      </label>

      <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-sand bg-warm/40 px-4 py-3">
        <input
          v-model="enrolledNow"
          type="checkbox"
          class="h-5 w-5 rounded border-sand text-terracotta focus:ring-terracotta/40"
        />
        <span class="text-sm text-ink">
          Mark as enrolled now
          <span class="text-slate-warm">— I've added them in the BW terminal</span>
        </span>
      </label>

      <div class="flex gap-3 pt-1">
        <button type="button" class="btn btn-ghost flex-1" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary flex-1" :disabled="!canSubmit">
          {{ submitting ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
