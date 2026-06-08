import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  // ── Public (no nav chrome) ──
  { path: '/enroll', name: 'enroll', component: () => import('../views/Enroll.vue'), meta: { public: true } },
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },

  // ── Protected ── (the app shell + nested routes arrive in Phase 4)
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true },
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
