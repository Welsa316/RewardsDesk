<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const firstName = auth.user?.name?.split(' ')[0] ?? '';
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <h1 class="font-serif text-2xl text-ink">Welcome back, {{ firstName }}</h1>
    <p class="mt-1 text-slate-warm">
      Goal progress, trends, and source breakdown arrive in the next phase.
    </p>
    <div class="card mt-6 p-6">
      <p class="text-sm text-slate-warm">
        Head to the
        <RouterLink :to="{ name: 'queue' }" class="font-medium text-terracotta hover:underline">
          Queue
        </RouterLink>
        to process pending enrollments.
      </p>
    </div>
  </div>
</template>
