<script setup>
import { ref, watchEffect } from 'vue';
import QRCode from 'qrcode';
import { copyText } from '../utils/clipboard';
import { sourceLabel } from '../utils/format';
import { useToastStore } from '../stores/toast';

const props = defineProps({
  source: { type: String, required: true },
  baseUrl: { type: String, required: true },
  // Optional overrides (used by the parking-signs section); defaults preserve
  // the original /enroll behavior.
  link: { type: String, default: '' },
  label: { type: String, default: '' },
  filename: { type: String, default: '' },
});

const toast = useToastStore();
const dataUrl = ref('');
const qrError = ref(false);
const resolvedLink = ref('');
const copied = ref(false);

watchEffect(async () => {
  resolvedLink.value = props.link || `${props.baseUrl}/enroll?src=${encodeURIComponent(props.source)}`;
  qrError.value = false;
  try {
    dataUrl.value = await QRCode.toDataURL(resolvedLink.value, {
      width: 320,
      margin: 2,
      color: { dark: '#0F1B2D', light: '#FFFFFF' },
    });
  } catch {
    dataUrl.value = '';
    qrError.value = true;
  }
});

async function copy() {
  if (await copyText(resolvedLink.value)) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  } else {
    toast.error("Couldn't copy — select the link text and copy manually.");
  }
}
</script>

<template>
  <div class="card p-4 text-center">
    <h3 class="font-serif text-lg text-ink">{{ label || sourceLabel(source) }}</h3>
    <img
      v-if="dataUrl"
      :src="dataUrl"
      :alt="`QR code for ${sourceLabel(source)}`"
      class="mx-auto mt-3 h-40 w-40 rounded-lg border border-sand"
    />
    <p v-else-if="qrError" class="mx-auto mt-3 flex h-40 w-40 items-center justify-center rounded-lg border border-sand text-sm text-slate-warm">
      Couldn't generate QR
    </p>
    <p class="mt-3 break-all text-xs text-slate-warm">{{ resolvedLink }}</p>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="btn flex-1 border border-sand bg-white !py-2 text-ink hover:bg-sand/50"
        @click="copy"
      >
        {{ copied ? 'Copied' : 'Copy link' }}
      </button>
      <a
        v-if="dataUrl"
        :href="dataUrl"
        :download="filename || `rewardsdesk-${source}.png`"
        class="btn btn-secondary flex-1 !py-2"
      >
        Download
      </a>
    </div>
  </div>
</template>
