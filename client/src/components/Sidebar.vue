<script setup>
import { RouterLink, useRoute } from 'vue-router';
import BrandMark from './BrandMark.vue';

defineProps({
  items: { type: Array, required: true },
  user: { type: Object, default: null },
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
  car: 'M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11m-14 0h14m-14 0a2 2 0 0 0-2 2v3.5h2M19 11a2 2 0 0 1 2 2v3.5h-2m-12 0a1.75 1.75 0 1 0 3.5 0m5 0a1.75 1.75 0 1 0 3.5 0m-12 0h8.5',
  ticket: 'M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM13 6v2m0 3v2m0 3v2',
  sliders: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2M14 4v4M6 10v4M14 16v4',
  image: 'M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM3 16l5-5 4 4 3-3 6 6M8.5 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  tag: 'M3 12V5.5A1.5 1.5 0 0 1 4.5 4H11l9 9-6.5 6.5zM7.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
};

function isActive(item) {
  return route.name === item.routeName || (item.matches?.includes(route.name) ?? false);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="px-5 py-5">
      <BrandMark size="sm" />
      <p class="mt-2 text-xs font-medium uppercase tracking-wider text-slate-warm">Rewards Desk</p>
    </div>

    <nav class="flex-1 space-y-1 overflow-y-auto px-3">
      <template v-for="item in items" :key="item.name">
        <p
          v-if="item.heading"
          class="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-warm first:pt-1"
        >
          {{ item.name }}
        </p>
        <RouterLink
          v-else
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
            v-if="item.badge"
            class="rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="isActive(item) ? 'bg-white/20 text-white' : 'bg-terracotta text-white'"
          >
            {{ item.badge }}
          </span>
        </RouterLink>
      </template>
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
