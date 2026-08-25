<script setup>
// Warns staff that this guest may already have a record — shown BEFORE they
// re-type someone into the Best Western terminal. Advisory only; it never
// blocks, because a real second guest can share a name.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { enrollments as api } from '../api';
import { statusLabel, formatDateTime } from '../utils/format';

const props = defineProps({
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  excludeId: { type: [Number, String], default: null },
});

const matches = ref([]);
let debounce;
let checkSeq = 0;

async function check() {
  const mine = ++checkSeq;
  const params = {};
  if (props.email?.trim()) params.email = props.email.trim();
  if (props.phone?.trim()) params.phone = props.phone.trim();
  if (props.firstName?.trim() && props.lastName?.trim()) {
    params.first_name = props.firstName.trim();
    params.last_name = props.lastName.trim();
  }
  if (props.excludeId) params.exclude_id = props.excludeId;
  if (!Object.keys(params).length) {
    matches.value = [];
    return;
  }
  try {
    const { data } = await api.duplicates(params);
    // Clearing the email field takes the early return above; without this an
    // older in-flight response would then re-populate the warning for details
    // that are no longer in the form.
    if (mine !== checkSeq) return;
    matches.value = data.matches;
  } catch {
    if (mine !== checkSeq) return;
    matches.value = []; // never let the advisory break the form
  }
}

watch(
  () => [props.email, props.phone, props.firstName, props.lastName],
  () => {
    clearTimeout(debounce);
    debounce = setTimeout(check, 400);
  },
);
onMounted(check);
// This lives inside modals, so closing one mid-typing would otherwise fire a
// duplicates lookup for a form that no longer exists.
onBeforeUnmount(() => {
  checkSeq++;
  clearTimeout(debounce);
});
</script>

<template>
  <div
    v-if="matches.length"
    role="status"
    class="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
  >
    <svg class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
    <div class="min-w-0 text-sm text-amber-900">
      <p class="font-medium">
        Possible duplicate —
        {{ matches.length === 1 ? '1 existing record matches' : `${matches.length} existing records match` }}
        this guest.
      </p>
      <ul class="mt-1 space-y-0.5">
        <li v-for="m in matches" :key="m.id" class="truncate">
          {{ m.first_name }} {{ m.last_name }} · {{ statusLabel(m.status) }} ·
          {{ formatDateTime(m.created_at) }}
          <span v-if="m.processed_by_name"> · {{ m.processed_by_name }}</span>
        </li>
      </ul>
      <p class="mt-1 text-xs">Check the Best Western terminal before enrolling again.</p>
    </div>
  </div>
</template>
