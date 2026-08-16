import axios from 'axios';

// Same-origin in prod; the Vite dev server proxies /api -> Express.
// withCredentials lets the httpOnly auth cookie ride along.
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Global 401 handler: when the session cookie expires mid-use, clear auth
// state and bounce to /login instead of leaving a broken authenticated UI.
// Auth endpoints are excluded — they manage their own 401 semantics (and
// fetchMe probing /auth/me on public pages must not trigger a redirect).
// Dynamic imports dodge the api -> store/router -> api import cycle.
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    if (status === 401 && !url.includes('/auth/')) {
      try {
        const [{ useAuthStore }, routerModule] = await Promise.all([
          import('../stores/auth'),
          import('../router'),
        ]);
        const auth = useAuthStore();
        auth.user = null;
        const router = routerModule.default;
        const current = router.currentRoute.value;
        if (!current.meta.public && current.name !== 'login') {
          router.push({ name: 'login', query: { redirect: current.fullPath } });
        }
      } catch {
        // never let the redirect path mask the original error
      }
    }
    return Promise.reject(error);
  },
);

export const auth = {
  login: (email, password) => http.post('/auth/login', { email, password }),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me'),
};

export const intake = {
  submit: (payload) => http.post('/intake', payload),
  publicConfig: () => http.get('/public/config'),
};

export const enrollments = {
  list: (params) => http.get('/enrollments', { params }),
  get: (id) => http.get(`/enrollments/${id}`),
  create: (payload) => http.post('/enrollments', payload),
  patch: (id, payload) => http.patch(`/enrollments/${id}`, payload),
  remove: (id) => http.delete(`/enrollments/${id}`),
  purge: (days) => http.post('/enrollments/purge', { days }),
};

export const stats = {
  dashboard: () => http.get('/stats/dashboard'),
  leaderboard: (params) => http.get('/stats/leaderboard', { params }),
};

export const staff = {
  list: () => http.get('/staff'),
  create: (payload) => http.post('/staff', payload),
  update: (id, payload) => http.patch(`/staff/${id}`, payload),
  deactivate: (id) => http.delete(`/staff/${id}`),
};

export const settings = {
  get: () => http.get('/settings'),
  update: (payload) => http.patch('/settings', payload),
};
