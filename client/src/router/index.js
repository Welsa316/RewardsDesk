import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  // ── Public (no nav chrome) ──
  { path: '/enroll', name: 'enroll', component: () => import('../views/Enroll.vue'), meta: { public: true } },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },

  // ── Protected (shared app shell) ──
  {
    path: '/',
    component: () => import('../components/AppShell.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'queue', name: 'queue', component: () => import('../views/Queue.vue') },
      { path: 'enrollments', name: 'enrollments', component: () => import('../views/Enrollments.vue') },
      {
        path: 'enrollments/:id',
        name: 'enrollment-detail',
        component: () => import('../views/EnrollmentDetail.vue'),
      },
      { path: 'leaderboard', name: 'leaderboard', component: () => import('../views/Leaderboard.vue') },
      {
        path: 'staff',
        name: 'staff',
        component: () => import('../views/Staff.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('../views/Settings.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'qr',
        name: 'qr',
        component: () => import('../views/QrCodes.vue'),
        meta: { requiresAdmin: true },
      },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.fetchMe();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'dashboard' };
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' };
  }
  return true;
});

export default router;
