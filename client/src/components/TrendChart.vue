<script setup>
import { computed } from 'vue';

const props = defineProps({ data: { type: Array, default: () => [] } });

const W = 720;
const H = 220;
const PAD = 10;

const max = computed(() => Math.max(1, ...props.data.map((d) => d.count)));

const points = computed(() => {
  const n = props.data.length;
  if (n === 0) return [];
  return props.data.map((d, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * (W - PAD * 2) + PAD;
    const y = H - PAD - (d.count / max.value) * (H - PAD * 2);
    return [x, y];
  });
});

const linePath = computed(() =>
  points.value.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
);

const areaPath = computed(() => {
  if (!points.value.length) return '';
  const last = points.value[points.value.length - 1];
  const first = points.value[0];
  return `${linePath.value} L${last[0].toFixed(1)} ${H - PAD} L${first[0].toFixed(1)} ${H - PAD} Z`;
});

const total = computed(() => props.data.reduce((s, d) => s + d.count, 0));
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="h-44 w-full">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#C65D3E" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#C65D3E" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line :x1="0" :y1="H - PAD" :x2="W" :y2="H - PAD" stroke="#E8DDD0" stroke-width="1" vector-effect="non-scaling-stroke" />
      <path v-if="areaPath" :d="areaPath" fill="url(#trendFill)" />
      <path
        v-if="linePath"
        :d="linePath"
        fill="none"
        stroke="#C65D3E"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
    <p class="mt-2 text-center text-xs text-slate-warm">
      {{ total }} enrolled in this period · peak {{ max }}/day
    </p>
  </div>
</template>
