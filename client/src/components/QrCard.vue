<script setup>
import { ref, watchEffect } from 'vue';
import QRCode from 'qrcode';
import { copyText } from '../utils/clipboard';
import { sourceLabel } from '../utils/format';

const props = defineProps({
  source: { type: String, required: true },
  baseUrl: { type: String, required: true },
});

const dataUrl = ref('');
const link = ref('');
const copied = ref(false);

watchEffect(async () => {
  link.value = `${props.baseUrl}/enroll?src=${encodeURIComponent(props.source)}`;
  try {
    dataUrl.value = await QRCode.toDataURL(link.value, {
      width: 320,
      margin: 2,
      color: { dark: '#0F1B2D', light: '#FFFFFF' },
    });
  } catch {
    dataUrl.value = '';
  }
});

async function copy() {
  if (await copyText(link.value)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  }
}
</script>

<template>
  <div class="card p-4 text-center">
    <h3 class="font-serif text-lg text-ink">{{ sourceLabel(source) }}</h3>
    <img
      v-if="dataUrl"
      :src="dataUrl"
      :alt="`QR code for ${sourceLabel(source)}`"
      class="mx-auto mt-3 h-40 w-40 rounded-lg border border-sand"
    />
    <p class="mt-3 break-all text-xs text-slate-warm">{{ link }}</p>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="btn flex-1 border border-sand bg-white !py-2 text-ink hover:bg-sand/50"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy link' }}
      </button>
      <a :href="dataUrl" :download="`rewardsdesk-${source}.png`" class="btn btn-secondary flex-1 !py-2">
        Download
      </a>
    </div>
  </div>
</template>
