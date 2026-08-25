import { defineStore } from 'pinia';
import { enrollments as api } from '../api';

const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at);

export const useEnrollmentsStore = defineStore('enrollments', {
  state: () => ({
    pending: [],
    total: 0, // server-side count; pending[] is capped at 100
    loading: false,
    loaded: false,
    error: '',
  }),
  getters: {
    pendingCount: (s) => s.total || s.pending.length,
    // True when the Queue is showing fewer rows than actually exist.
    pendingTruncated: (s) => s.total > s.pending.length,
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
        // The server caps pageSize at 100 and the Queue has no pagination, so
        // pending.length silently under-reports once a backlog builds — the
        // sidebar badge read 100 while the dashboard read the true 137.
        this.total = data.total;
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
        // Re-sort instead of splicing at the captured index — the array may
        // have shifted (another process/undo/walk-up) while the PATCH was
        // in flight.
        if (removed) {
          this.pending.push(removed);
          this.pending.sort(byNewest);
        }
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
