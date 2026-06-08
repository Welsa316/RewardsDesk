<script setup>
import { RouterView } from 'vue-router';
import Toast from './components/Toast.vue';
</script>

<template>
  <RouterView v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </RouterView>
  <Toast />
</template>
