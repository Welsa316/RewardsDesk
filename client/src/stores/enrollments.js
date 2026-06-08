import { defineStore } from 'pinia';
import { enrollments as api } from '../api';

const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export const useEnrollmentsStore = defineStore('enrollments', {
  state: () => ({
    pending: [],
    loading: false,
    loaded: false,
    error: '',
  }),
  getters: {
    pendingCount: (s) => s.pending.length,
  },
  actions: {
    async loadPending() {
      this.loading = true;
      this.error = '';
      try {
        const { data } = await api.list({
          status: 'pending',
          pageSize: 100,
          sort: 'created_at',
          dir: 'desc',
        });
        this.pending = data.data;
        this.loaded = true;
      } catch {
        this.error = 'Could not load the queue.';
      } finally {
        this.loading = false;
      }
    },

    // Optimistically remove from the queue, then PATCH. Returns the removed
    // record so the caller can offer Undo; rolls back if the request fails.
    async process(id, status) {
      const idx = this.pending.findIndex((e) => e.id === id);
      const removed = idx >= 0 ? this.pending[idx] : null;
      if (idx >= 0) this.pending.splice(idx, 1);
      try {
        await api.patch(id, { status });
        return removed;
      } catch (err) {
        if (removed) this.pending.splice(idx, 0, removed);
        throw err;
      }
    },

    async undo(enrollment) {
      await api.patch(enrollment.id, { status: 'pending' });
      this.pending.push(enrollment);
      this.pending.sort(byNewest);
    },

    async createWalkUp(payload) {
      const { data } = await api.create(payload);
      if (data.status === 'pending') {
        this.pending.push(data);
        this.pending.sort(byNewest);
      }
      return data;
    },
  },
});
