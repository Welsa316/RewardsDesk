<script setup>
import { ref, computed, onMounted } from 'vue';
import { useEnrollmentsStore } from '../stores/enrollments';
import { useToastStore } from '../stores/toast';
import EnrollmentCard from '../components/EnrollmentCard.vue';
import ProcessModal from '../components/ProcessModal.vue';
import WalkUpForm from '../components/WalkUpForm.vue';
import { fullName } from '../utils/format';

const store = useEnrollmentsStore();
const toast = useToastStore();

const search = ref('');
const selected = ref(null);
const showWalkUp = ref(false);
const busy = ref(false);

const STATUS_LABELS = {
  enrolled: 'Enrolled',
  declined: 'Declined',
  already_member: 'Already a member',
  duplicate: 'Duplicate',
};

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return store.pending;
  return store.pending.filter((e) =>
    `${e.first_name} ${e.last_name} ${e.email || ''} ${e.phone || ''}`.toLowerCase().includes(q),
  );
});

onMounted(() => store.loadPending());

async function act(status) {
  const enrollment = selected.value;
  if (!enrollment) return;
  busy.value = true;
  try {
    const removed = await store.process(enrollment.id, status);
    selected.value = null;
    toast.success(`${fullName(enrollment)} — ${STATUS_LABELS[status]}`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          try {
            await store.undo(removed);
            toast.success('Restored to queue');
          } catch {
            toast.error('Could not undo.');
          }
        },
      },
    });
  } catch {
    toast.error('Could not update. Please try again.');
  } finally {
    busy.value = false;
  }
}

function onWalkUpCreated(data) {
  showWalkUp.value = false;
  toast.success(`${fullName(data)} added${data.status === 'enrolled' ? ' — enrolled' : ' to queue'}`);
}
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div class="mb-5 flex items-center justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl text-ink">Pending queue</h1>
        <p class="text-sm text-slate-warm">{{ store.pendingCount }} waiting to be processed</p>
      </div>
      <button class="btn btn-primary !py-2.5" @click="showWalkUp = true">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
        <span class="hidden sm:inline">Add walk-up</span>
      </button>
    </div>

    <input v-model="search" class="input mb-4" placeholder="Search name, email, or phone…" />

    <!-- Loading skeleton -->
    <div v-if="store.loading && !store.loaded" class="space-y-3">
      <div v-for="i in 3" :key="i" class="h-28 animate-pulse rounded-2xl border border-sand bg-white/60" />
    </div>

    <!-- Error -->
    <div v-else-if="store.error" class="card p-6 text-center">
      <p class="text-slate-warm">{{ store.error }}</p>
      <button class="btn btn-secondary mt-4" @click="store.loadPending()">Retry</button>
    </div>

    <!-- Empty -->
    <div v-else-if="filtered.length === 0" class="card p-10 text-center">
      <p class="font-serif text-lg text-ink">
        {{ search ? 'No matches' : 'No pending enrollments — nice work.' }}
      </p>
      <p class="mt-1 text-sm text-slate-warm">
        {{ search ? 'Try a different search.' : 'New guest submissions will appear here.' }}
      </p>
    </div>

    <!-- List -->
    <TransitionGroup v-else name="fade" tag="div" class="space-y-3">
      <EnrollmentCard
        v-for="e in filtered"
        :key="e.id"
        :enrollment="e"
        @process="selected = e"
      />
    </TransitionGroup>

    <ProcessModal
      v-if="selected"
      :enrollment="selected"
      :busy="busy"
      @close="selected = null"
      @action="act"
    />
    <WalkUpForm v-if="showWalkUp" @close="showWalkUp = false" @created="onWalkUpCreated" />
  </div>
</template>
