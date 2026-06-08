<script setup>
import Modal from './Modal.vue';
import CopyField from './CopyField.vue';
import CopyAllButton from './CopyAllButton.vue';
import StatusPill from './StatusPill.vue';
import { fullName, sourceLabel } from '../utils/format';

defineProps({
  enrollment: { type: Object, required: true },
  busy: { type: Boolean, default: false },
});
defineEmits(['close', 'action']);

const ACTIONS = [
  { status: 'enrolled', label: 'Enrolled', primary: true },
  { status: 'declined', label: 'Declined', primary: false },
  { status: 'already_member', label: 'Already a member', primary: false },
  { status: 'duplicate', label: 'Duplicate', primary: false },
];
</script>

<template>
  <Modal :title="fullName(enrollment)" @close="$emit('close')">
    <div class="space-y-5">
      <div class="flex flex-wrap items-center gap-2 text-sm text-slate-warm">
        <StatusPill :status="enrollment.status" />
        <span>·</span>
        <span>{{ sourceLabel(enrollment.source) }}</span>
        <span
          v-if="enrollment.prefilled"
          class="rounded-full bg-sand/70 px-2 py-0.5 text-xs font-medium"
        >
          Prefilled
        </span>
      </div>

      <p class="rounded-xl border border-sand bg-warm px-4 py-3 text-sm text-slate-warm">
        Enter this into the Best Western terminal, then mark the result below.
      </p>

      <CopyAllButton :enrollment="enrollment" />

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CopyField label="First name" :value="enrollment.first_name" />
        <CopyField label="Last name" :value="enrollment.last_name" />
        <CopyField class="sm:col-span-2" label="Email" :value="enrollment.email" />
        <CopyField class="sm:col-span-2" label="Phone" :value="enrollment.phone" />
        <CopyField class="sm:col-span-2" label="Address line 1" :value="enrollment.address_line1" />
        <CopyField
          v-if="enrollment.address_line2"
          class="sm:col-span-2"
          label="Address line 2"
          :value="enrollment.address_line2"
        />
        <CopyField label="City" :value="enrollment.city" />
        <CopyField label="State" :value="enrollment.state" />
        <CopyField label="ZIP" :value="enrollment.postal_code" />
        <CopyField label="Country" :value="enrollment.country" />
      </div>

      <div>
        <p class="label">Mark result</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="a in ACTIONS"
            :key="a.status"
            type="button"
            class="btn"
            :class="a.primary ? 'btn-primary' : 'border border-sand bg-white text-ink hover:bg-sand/50'"
            :disabled="busy"
            @click="$emit('action', a.status)"
          >
            {{ a.label }}
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
