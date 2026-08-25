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
      // A toast carrying an Undo is the only route back, so it has to outlive a
      // four-second glance while an agent is still talking to the guest.
      const timeout = opts.action ? 12000 : undefined;
      return this.push({ message, type: 'success', ...(timeout ? { timeout } : {}), ...opts });
    },
    error(message, opts = {}) {
      return this.push({ message, type: 'error', timeout: 6000, ...opts });
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    },
  },
});
