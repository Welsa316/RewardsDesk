<script setup>
import { reactive, ref, computed } from 'vue';
import Modal from './Modal.vue';
import DurationPicker from './DurationPicker.vue';
import { parking } from '../api';
import { formatMoney } from '../utils/format';
import { US_STATES, DEFAULT_STATE } from '../utils/states';

const props = defineProps({ rates: { type: Object, default: null } });
const emit = defineEmits(['close', 'created']);

const kind = ref('desk'); // 'desk' | 'comp'
const form = reactive({
  guest_name: '',
  phone: '',
  plate: '',
  plate_state: DEFAULT_STATE,
  room: '',
  vehicle_desc: '',
  desk_method: 'cash',
  comp_reason: '',
  comp_authorized_by: '',
});
const duration = ref({ rate_type: 'daily', quantity: 1 });
const submitting = ref(false);
const formError = ref('');
const fieldErrors = reactive({});

const totalCents = computed(() => {
  if (!props.rates) return 0;
  return duration.value.quantity * props.rates.daily_cents;
});

async function submit() {
  formError.value = '';
  Object.keys(fieldErrors).forEach((k) => delete fieldErrors[k]);
  submitting.value = true;
  try {
    const { data } = await parking.create({
      kind: kind.value,
      ...form,
      plate: form.plate.toUpperCase(),
      plate_state: form.plate_state,
      rate_type: duration.value.rate_type,
      quantity: duration.value.quantity,
    });
    emit('created', data);
  } catch (err) {
    const d = err?.response?.data;
    if (d?.fields) Object.assign(fieldErrors, d.fields);
    formError.value = d?.error || 'Could not create the session.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal title="New parking session" :dismissible="false" :busy="submitting" @close="emit('close')">
    <form class="space-y-4" novalidate @submit.prevent="submit">
      <p
        v-if="formError"
        role="alert"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ formError }}
      </p>

      <div class="flex rounded-xl border border-sand p-1" role="radiogroup" aria-label="Session type">
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'desk'"
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
          :class="kind === 'desk' ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
          @click="kind = 'desk'"
        >
          Paid at desk
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'comp'"
          class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
          :class="kind === 'comp' ? 'bg-ink text-white' : 'text-slate-warm hover:text-ink'"
          @click="kind = 'comp'"
        >
          Complimentary
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="label" for="np_name">Guest name</label>
          <input
            id="np_name"
            v-model="form.guest_name"
            class="input"
            :class="{ 'input-error': fieldErrors.guest_name }"
            :aria-invalid="fieldErrors.guest_name ? 'true' : undefined"
            autocapitalize="words"
            spellcheck="false"
          />
          <p v-if="fieldErrors.guest_name" class="field-error">{{ fieldErrors.guest_name }}</p>
        </div>
        <div>
          <label class="label" for="np_plate">Plate</label>
          <div class="flex gap-2">
            <input
              id="np_plate"
              v-model="form.plate"
              class="input uppercase"
              :class="{ 'input-error': fieldErrors.plate }"
              :aria-invalid="fieldErrors.plate ? 'true' : undefined"
              autocapitalize="characters"
              spellcheck="false"
            />
            <select
              id="np_plate_state"
              v-model="form.plate_state"
              class="input !w-24 shrink-0"
              aria-label="License plate state"
            >
              <option v-for="st in US_STATES" :key="st" :value="st">{{ st }}</option>
            </select>
          </div>
          <p v-if="fieldErrors.plate" class="field-error">{{ fieldErrors.plate }}</p>
        </div>
        <div>
          <label class="label" for="np_phone">Phone <span class="text-slate-warm">(optional)</span></label>
          <input id="np_phone" v-model="form.phone" class="input" type="tel" inputmode="tel" />
          <p v-if="fieldErrors.phone" class="field-error">{{ fieldErrors.phone }}</p>
        </div>
        <div>
          <label class="label" for="np_room">Room <span class="text-slate-warm">(optional)</span></label>
          <input id="np_room" v-model="form.room" class="input" />
        </div>
      </div>
      <div>
        <label class="label" for="np_vehicle">Vehicle <span class="text-slate-warm">(optional)</span></label>
        <input id="np_vehicle" v-model="form.vehicle_desc" class="input" placeholder="Silver Camry" />
      </div>

      <div v-if="rates">
        <p class="label">Duration</p>
        <DurationPicker v-model="duration" :rates="rates" />
      </div>
      <p v-else class="rounded-xl border border-sand bg-warm/40 px-4 py-3 text-sm text-slate-warm">
        Rates unavailable — try reopening this dialog.
      </p>

      <template v-if="kind === 'desk'">
        <div>
          <label class="label" for="np_method">Paid by</label>
          <select id="np_method" v-model="form.desk_method" class="input">
            <option value="cash">Cash</option>
            <option value="card_terminal">Card terminal</option>
          </select>
          <p v-if="fieldErrors.desk_method" class="field-error">{{ fieldErrors.desk_method }}</p>
        </div>
        <p class="rounded-xl border border-sand bg-warm/40 px-4 py-3 text-sm text-ink">
          Collect <span class="font-semibold">{{ formatMoney(totalCents) }}</span> at the desk.
        </p>
      </template>

      <template v-else>
        <div>
          <label class="label" for="np_reason">Reason</label>
          <input
            id="np_reason"
            v-model="form.comp_reason"
            class="input"
            :class="{ 'input-error': fieldErrors.comp_reason }"
            placeholder="e.g. Hotel guest benefit"
          />
          <p v-if="fieldErrors.comp_reason" class="field-error">{{ fieldErrors.comp_reason }}</p>
        </div>
        <div>
          <label class="label" for="np_auth">Authorized by</label>
          <input
            id="np_auth"
            v-model="form.comp_authorized_by"
            class="input"
            :class="{ 'input-error': fieldErrors.comp_authorized_by }"
            placeholder="Name or title of who approved it"
          />
          <p v-if="fieldErrors.comp_authorized_by" class="field-error">{{ fieldErrors.comp_authorized_by }}</p>
        </div>
      </template>

      <div class="flex gap-3 pt-1">
        <button type="button" class="btn btn-ghost flex-1" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary flex-1" :disabled="submitting || !rates">
          {{ submitting ? 'Creating…' : 'Create session' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
