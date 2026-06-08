import axios from 'axios';

// Same-origin in prod; the Vite dev server proxies /api -> Express.
// withCredentials lets the httpOnly auth cookie ride along.
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

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
