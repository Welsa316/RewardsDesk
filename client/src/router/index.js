import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  // ── Public (no nav chrome) ──
  { path: '/', name: 'home', component: () => import('../views/Home.vue'), meta: { public: true } },
  { path: '/enroll', name: 'enroll', component: () => import('../views/Enroll.vue'), meta: { public: true } },
  { path: '/sms', name: 'sms-policy', component: () => import('../views/SmsPolicy.vue'), meta: { public: true } },
  {
    path: '/admin/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  // Anyone with the old bookmark still lands in the right place.
  { path: '/login', redirect: { name: 'login' } },
  // Parking is white-label: meta.public also keeps the 401 interceptor away.
  { path: '/park', name: 'park', component: () => import('../views/Park.vue'), meta: { public: true } },
  {
    path: '/park/s/:token',
    name: 'park-status',
    component: () => import('../views/ParkStatus.vue'),
    meta: { public: true },
  },

  // ── Protected (shared app shell), all under /admin ──
  {
    path: '/admin',
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
      { path: 'parking', name: 'parking', component: () => import('../views/ParkingDashboard.vue') },
      {
        path: 'parking/sessions',
        name: 'parking-sessions',
        component: () => import('../views/ParkingSessions.vue'),
      },
      {
        path: 'parking/settings',
        name: 'parking-settings',
        component: () => import('../views/ParkingSettings.vue'),
        meta: { requiresAdmin: true },
      },
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
        path: 'parking-promos',
        name: 'parking-promos',
        component: () => import('../views/ParkingPromos.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'promos',
        name: 'promos',
        component: () => import('../views/Promos.vue'),
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

  // Staff had these bookmarked when they lived at the root. Without these a
  // saved link to /queue now falls through the catch-all to the public home
  // page, which looks like the app has lost their data.
  ...['queue', 'enrollments', 'leaderboard', 'parking', 'staff', 'settings', 'qr'].map((p) => ({
    path: `/${p}`,
    redirect: { path: `/admin/${p}` },
  })),
  { path: '/enrollments/:id', redirect: (to) => `/admin/enrollments/${to.params.id}` },
  { path: '/parking/sessions', redirect: { path: '/admin/parking/sessions' } },
  { path: '/parking/settings', redirect: { path: '/admin/parking/settings' } },

  { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  // Public pages have no use for auth state, and this await ran *before* the
  // route's own chunk was fetched — so a guest scanning a lot QR waited out a
  // guaranteed-401 round trip on a blank screen before the form even started
  // downloading. `login` still needs it, to redirect an already-signed-in user.
  const needsAuth = !to.meta.public || to.name === 'login';
  if (needsAuth && !auth.ready) await auth.fetchMe();

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

// The static HTML ships the white-label chrome, and in production Express
// swaps it for staff routes. The router covers client-side navigation (and
// `vite dev`, which serves index.html untouched). Parking routes are left
// alone — Park/ParkStatus own their chrome via utils/whitelabel.
// Public pages set their own titles (and the parking pages own their chrome
// via utils/whitelabel); only the staff app announces itself by name.
const PUBLIC_TITLES = {
  home: 'Parking & Rewards',
  enroll: 'Rewards Enrollment',
  'sms-policy': 'Text service — Pay to Park',
};

router.afterEach((to) => {
  if (to.path === '/park' || to.path.startsWith('/park/')) return;
  document.title = PUBLIC_TITLES[to.name] || 'RewardsDesk';
});

export default router;
