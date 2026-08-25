<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter, RouterView } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEnrollmentsStore } from '../stores/enrollments';
import { useToastStore } from '../stores/toast';
import { focusFirst, trapTabKey } from '../utils/focusTrap';
import Sidebar from './Sidebar.vue';
import TopBar from './TopBar.vue';

const auth = useAuthStore();
const enrollments = useEnrollmentsStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();

const drawerOpen = ref(false);

// Two product areas share the shell: Rewards (original) and Parking.
// Heading rows are non-link section labels; badge shows a live count.
const navItems = computed(() => {
  const all = [
    { heading: true, name: 'Rewards' },
    { name: 'Dashboard', routeName: 'dashboard', to: { name: 'dashboard' }, icon: 'grid' },
    { name: 'Queue', routeName: 'queue', to: { name: 'queue' }, icon: 'inbox', badge: enrollments.pendingCount },
    {
      name: 'Enrollments',
      routeName: 'enrollments',
      to: { name: 'enrollments' },
      icon: 'list',
      matches: ['enrollment-detail'],
    },
    { name: 'Leaderboard', routeName: 'leaderboard', to: { name: 'leaderboard' }, icon: 'chart' },
    { heading: true, name: 'Parking' },
    { name: 'Overview', routeName: 'parking', to: { name: 'parking' }, icon: 'car' },
    { name: 'Sessions', routeName: 'parking-sessions', to: { name: 'parking-sessions' }, icon: 'ticket' },
    { heading: true, name: 'Admin', admin: true },
    { name: 'Staff', routeName: 'staff', to: { name: 'staff' }, icon: 'users', admin: true },
    { name: 'Settings', routeName: 'settings', to: { name: 'settings' }, icon: 'settings', admin: true },
    {
      name: 'Parking Settings',
      routeName: 'parking-settings',
      to: { name: 'parking-settings' },
      icon: 'sliders',
      admin: true,
    },
    { name: 'QR & links', routeName: 'qr', to: { name: 'qr' }, icon: 'qr', admin: true },
  ];
  return all.filter((i) => !i.admin || auth.isAdmin);
});

const TITLES = {
  dashboard: 'Dashboard',
  queue: 'Queue',
  enrollments: 'Enrollments',
  'enrollment-detail': 'Enrollment',
  leaderboard: 'Leaderboard',
  staff: 'Staff',
  settings: 'Settings',
  qr: 'QR & links',
  parking: 'Parking',
  'parking-sessions': 'Parking sessions',
  'parking-settings': 'Parking settings',
};
const pageTitle = computed(() => TITLES[route.name] || 'RewardsDesk');

async function logout() {
  // The redirect must happen even if the network call fails — otherwise the UI
  // sits half-signed-out on a page full of guest records, and a reload
  // re-authenticates from the cookie the server never got to clear.
  try {
    await auth.logout();
  } catch {
    toast.error('Signed out on this device, but the server could not be reached.');
  } finally {
    router.push({ name: 'login' });
  }
}

// Drawer focus management: focus moves in on open, stays trapped, Escape
// closes, and focus returns to the opener (the hamburger) on close.
const drawerRef = ref(null);
let drawerReturnFocus = null;

function onDrawerKey(e) {
  if (e.key === 'Escape') {
    drawerOpen.value = false;
    return;
  }
  trapTabKey(drawerRef.value, e);
}

watch(drawerOpen, async (open) => {
  if (open) {
    drawerReturnFocus = document.activeElement;
    document.addEventListener('keydown', onDrawerKey);
    await nextTick();
    focusFirst(drawerRef.value);
  } else {
    document.removeEventListener('keydown', onDrawerKey);
    drawerReturnFocus?.focus?.();
    drawerReturnFocus = null;
  }
});
onBeforeUnmount(() => document.removeEventListener('keydown', onDrawerKey));

watch(() => route.fullPath, () => (drawerOpen.value = false));
onMounted(() => {
  if (!enrollments.loaded) enrollments.loadPending();
});
</script>

<template>
  <div class="min-h-screen bg-warm lg:flex">
    <!-- Desktop sidebar -->
    <aside class="hidden w-64 shrink-0 border-r border-sand bg-white lg:block">
      <div class="sticky top-0 h-screen">
        <Sidebar
          :items="navItems"
          :user="auth.user"
          @logout="logout"
        />
      </div>
    </aside>

    <!-- Mobile drawer. Deliberately NOT wrapped in <Transition>: transition
         completion rides on rAF, which throttled/backgrounded tabs suspend —
         and a lingering invisible overlay would swallow every tap. Instant
         mount/unmount is deterministic. -->
    <div v-if="drawerOpen" class="fixed inset-0 z-30 lg:hidden">
        <div class="absolute inset-0 bg-ink/40" @click="drawerOpen = false" />
        <aside
          ref="drawerRef"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          class="absolute inset-y-0 left-0 w-72 bg-white shadow-xl"
        >
          <Sidebar
            :items="navItems"
            :user="auth.user"
              @navigate="drawerOpen = false"
            @logout="logout"
          />
        </aside>
    </div>

    <!-- Main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar :title="pageTitle" @toggle="drawerOpen = true" />
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
