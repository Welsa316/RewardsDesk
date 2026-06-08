import { defineStore } from 'pinia';

let nextId = 1;

export const useToastStore = defineStore('toast', {
  state: () => ({ toasts: [] }),
  actions: {
    push({ message, type = 'info', timeout = 4000, action = null }) {
      const id = nextId++;
      this.toasts.push({ id, message, type, action });
      if (timeout) setTimeout(() => this.dismiss(id), timeout);
      return id;
    },
    success(message, opts = {}) {
      return this.push({ message, type: 'success', ...opts });
    },
    error(message, opts = {}) {
      return this.push({ message, type: 'error', timeout: 6000, ...opts });
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
  },
});
