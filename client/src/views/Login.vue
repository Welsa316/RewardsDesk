<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import BrandMark from '../components/BrandMark.vue';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.push(redirect);
  } catch (err) {
    error.value = err?.response?.data?.error || 'Unable to sign in. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-warm px-4 py-8">
    <div class="w-full max-w-sm">
      <header class="mb-6 text-center">
        <BrandMark size="md" class="mb-3" />
        <h1 class="font-serif text-2xl text-ink">RewardsDesk</h1>
        <p class="mt-1 text-sm text-slate-warm">Front-desk sign in</p>
      </header>

      <form class="card space-y-5 p-6" novalidate @submit.prevent="submit">
        <p
          v-if="error"
          class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ error }}
        </p>

        <div>
          <label class="label" for="email">Email</label>
          <input
            id="email"
            v-model="email"
            class="input"
            type="email"
            inputmode="email"
            autocomplete="email"
            required
          />
        </div>

        <div>
          <label class="label" for="password">Password</label>
          <input
            id="password"
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>

        <button type="submit" class="btn btn-primary w-full" :disabled="loading">
          <span v-if="loading">Signing in…</span>
          <span v-else>Sign in</span>
        </button>
      </form>
    </div>
  </div>
</template>
