<script setup>
// Placeholder landing for Phase 3 — confirms protected routing + auth works.
// Replaced by the real dashboard (inside the app shell) in Phase 5.
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-warm px-4 py-8">
    <div class="card w-full max-w-md p-8 text-center">
      <h1 class="font-serif text-2xl text-ink">Welcome, {{ auth.user?.name }}</h1>
      <p class="mt-2 text-slate-warm">You're signed in as {{ auth.user?.role }}.</p>
      <p class="mt-1 text-sm text-slate-warm/80">The dashboard &amp; worklist arrive in the next phases.</p>
      <button class="btn btn-secondary mt-6" @click="logout">Log out</button>
    </div>
  </div>
</template>
