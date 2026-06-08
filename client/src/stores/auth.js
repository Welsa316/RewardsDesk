import { defineStore } from 'pinia';
import { auth as authApi } from '../api';

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
      }
    },
  },
});
