import { defineStore } from 'pinia';
import { auth as authApi } from '../api';
import { useEnrollmentsStore } from './enrollments';
import { useStatsStore } from './stats';
import { useSettingsStore } from './settings';

// The front desk shares one tablet across a shift change, so signing out has to
// leave nothing of the previous user behind: not in Pinia (their queue, their
// dashboard numbers, guest PII) and not in the service worker's `api` cache,
// which would otherwise still hold their responses on disk.
function resetStores() {
  useEnrollmentsStore().$reset();
  useStatsStore().$reset();
  useSettingsStore().$reset();
}

async function clearApiCache() {
  try {
    if (typeof caches === 'undefined') return;
    await Promise.all(
      (await caches.keys())
        .filter((k) => k.includes('api'))
        .map((k) => caches.delete(k)),
    );
  } catch {
    // Cache API unavailable or blocked — nothing more we can do here.
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null, // { id, name, role } | null
    ready: false, // has the initial /me check resolved?
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    isAdmin: (s) => s.user?.role === 'admin',
  },
  actions: {
    async fetchMe() {
      try {
        const { data } = await authApi.me();
        this.user = data;
      } catch {
        this.user = null;
      } finally {
        this.ready = true;
      }
    },
    async login(email, password) {
      const { data } = await authApi.login(email, password);
      this.user = data;
      this.ready = true;
      return data;
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        this.user = null;
        this.ready = true;
        resetStores();
        await clearApiCache();
      }
    },
  },
});
