import { defineStore } from 'pinia';
import { settings as api } from '../api';

export const useSettingsStore = defineStore('settings', {
  state: () => ({ data: null, loading: false }),
  actions: {
    async load() {
      this.loading = true;
      try {
        const { data } = await api.get();
        this.data = data;
      } finally {
        this.loading = false;
      }
    },
    async save(payload) {
      const { data } = await api.update(payload);
      this.data = data;
      return data;
    },
  },
});
