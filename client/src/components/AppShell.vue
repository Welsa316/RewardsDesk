<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, RouterView } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useEnrollmentsStore } from '../stores/enrollments';
import Sidebar from './Sidebar.vue';
import TopBar from './TopBar.vue';

const auth = useAuthStore();
const enrollments = useEnrollmentsStore();
const route = useRoute();
const router = useRouter();

const drawerOpen = ref(false);

// Nav items grow as later phases land; admin-only items are filtered out for staff.
const navItems = computed(() => {
  const all = [
    { name: 'Dashboard', routeName: 'dashboard', to: { name: 'dashboard' }, icon: 'grid' },
    { name: 'Queue', routeName: 'queue', to: { name: 'queue' }, icon: 'inbox' },
    {
      name: 'Enrollments',
      routeName: 'enrollments',
      to: { name: 'enrollments' },
      icon: 'list',
      matches: ['enrollment-detail'],
    },
    { name: 'Leaderboard', routeName: 'leaderboard', to: { name: 'leaderboard' }, icon: 'chart' },
    { name: 'Staff', routeName: 'staff', to: { name: 'staff' }, icon: 'users', admin: true },
    { name: 'Settings', routeName: 'settings', to: { name: 'settings' }, icon: 'settings', admin: true },
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
};
const pageTitle = computed(() => TITLES[route.name] || 'RewardsDesk');

async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}

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
          :pending-count="enrollments.pendingCount"
          @logout="logout"
        />
      </div>
    </aside>

    <!-- Mobile drawer -->
    <Transition name="fade">
      <div v-if="drawerOpen" class="fixed inset-0 z-30 lg:hidden">
        <div class="absolute inset-0 bg-ink/40" @click="drawerOpen = false" />
        <aside class="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
          <Sidebar
            :items="navItems"
            :user="auth.user"
            :pending-count="enrollments.pendingCount"
            @navigate="drawerOpen = false"
            @logout="logout"
          />
        </aside>
      </div>
    </Transition>

    <!-- Main -->
    <div class="flex min-w-0 flex-1 flex-col">
      <TopBar :title="pageTitle" @toggle="drawerOpen = true" />
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
