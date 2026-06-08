<script setup>
import { RouterLink, useRoute } from 'vue-router';
import BrandMark from './BrandMark.vue';

defineProps({
  items: { type: Array, required: true },
  user: { type: Object, default: null },
  pendingCount: { type: Number, default: 0 },
});
defineEmits(['navigate', 'logout']);

const route = useRoute();

const ICONS = {
  grid: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 13h6v6h-6z',
  inbox: 'M3 12h4l2 3h6l2-3h4M5 5h14l1.5 7v6a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-6z',
  users: 'M16 18v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 18v-2a4 4 0 0 0-3-3.87',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chart: 'M3 3v18h18M7 16V9M12 16V5M17 16v-7',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 14H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6 8.6l-.33-1.82a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 18 6l1.82-.33a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 11h.1a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM18 18h2v2h-2z',
};

function isActive(item) {
  return route.name === item.routeName;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-3 px-5 py-5">
      <BrandMark size="sm" />
      <p class="font-serif text-lg leading-none text-ink">RewardsDesk</p>
    </div>

    <nav class="flex-1 space-y-1 overflow-y-auto px-3">
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="item.to"
        class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
        :class="
          isActive(item)
            ? 'bg-ink text-white'
            : 'text-slate-warm hover:bg-sand/50 hover:text-ink'
        "
        @click="$emit('navigate')"
      >
        <svg
          class="h-5 w-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path :d="ICONS[item.icon]" />
        </svg>
        <span class="flex-1">{{ item.name }}</span>
        <span
          v-if="item.routeName === 'queue' && pendingCount"
          class="rounded-full px-2 py-0.5 text-xs font-semibold"
          :class="isActive(item) ? 'bg-white/20 text-white' : 'bg-terracotta text-white'"
        >
          {{ pendingCount }}
        </span>
      </RouterLink>
    </nav>

    <div class="border-t border-sand p-3">
      <div class="px-2 py-2">
        <p class="truncate text-sm font-medium text-ink">{{ user?.name }}</p>
        <p class="text-xs capitalize text-slate-warm">{{ user?.role }}</p>
      </div>
      <button class="btn btn-ghost w-full justify-start" @click="$emit('logout')">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        </svg>
        Log out
      </button>
    </div>
  </div>
</template>
