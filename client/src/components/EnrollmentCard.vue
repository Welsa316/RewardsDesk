<script setup>
import { fullName, oneLineAddress, sourceLabel, timeAgo } from '../utils/format';

defineProps({ enrollment: { type: Object, required: true } });
defineEmits(['process']);
</script>

<template>
  <div class="card p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate font-serif text-lg text-ink">{{ fullName(enrollment) }}</h3>
        <p class="mt-0.5 truncate text-sm text-slate-warm">
          {{ enrollment.email || 'No email' }} · {{ enrollment.phone || 'No phone' }}
        </p>
        <p class="truncate text-sm text-slate-warm/80">{{ oneLineAddress(enrollment) || 'No address' }}</p>
      </div>
      <div class="shrink-0 text-right">
        <span class="text-xs font-medium text-slate-warm">{{ sourceLabel(enrollment.source) }}</span>
        <p class="mt-1 text-xs text-slate-warm/60">{{ timeAgo(enrollment.created_at) }}</p>
      </div>
    </div>
    <div class="mt-4 flex items-center gap-2">
      <span
        v-if="enrollment.prefilled"
        class="rounded-full bg-sand/70 px-2 py-0.5 text-xs font-medium text-slate-warm"
      >
        Prefilled
      </span>
      <button class="btn btn-primary ml-auto !py-2" @click="$emit('process')">View &amp; process</button>
    </div>
  </div>
</template>
