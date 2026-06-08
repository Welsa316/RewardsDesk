import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/main.css';

// Router is wired in Phase 3 once the public/auth/protected route groups exist.
createApp(App).use(createPinia()).mount('#app');
