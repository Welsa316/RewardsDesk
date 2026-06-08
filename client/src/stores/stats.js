import { defineStore } from 'pinia';
import { stats as api } from '../api';

export const useStatsStore = defineStore('stats', {
  state: () => ({ dashboard: null, loading: false, error: '' }),
  actions: {
    async loadDashboard() {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.dashboard();
        this.dashboard = data;
      } catch {
        this.error = 'Could not load the dashboard.';
      } finally {
        this.loading = false;
      }
    },
  },
});
