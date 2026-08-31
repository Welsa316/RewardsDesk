<script setup>
import { ref, computed, onMounted } from 'vue';
import Modal from './Modal.vue';
import ParkingStatusPill from './ParkingStatusPill.vue';
import DurationPicker from './DurationPicker.vue';
import { parking } from '../api';
import { useToastStore } from '../stores/toast';
import { useAuthStore } from '../stores/auth';
import { formatMoney, formatDateTime } from '../utils/format';
import { copyText } from '../utils/clipboard';
import { formatPlate } from '../utils/states';

const props = defineProps({
  sessionId: { type: Number, required: true },
  rates: { type: Object, default: null },
  taxBps: { type: Number, default: 0 },
});
const emit = defineEmits(['close', 'changed']);

const toast = useToastStore();
const auth = useAuthStore();

const s = ref(null);
const loadError = ref('');
const busy = ref(false);

// Extend
const extendOpen = ref(false);
const extendDuration = ref({ rate_type: 'daily', quantity: 1 });

// The extension is recorded at the tax-inclusive total, so that is what the
// agent has to take. This panel previously showed no total at all — cash was
// collected for a number the screen never displayed.
const extendSubtotalCents = computed(() =>
  props.rates ? extendDuration.value.quantity * props.rates.daily_cents : 0,
);
const extendTaxCents = computed(() => {
  const bps = Number(props.taxBps) || 0;
  return bps > 0 ? Math.round((extendSubtotalCents.value * bps) / 10000) : 0;
});
const extendTotalCents = computed(() => extendSubtotalCents.value + extendTaxCents.value);
const extendMethod = ref('cash');

// Notes
const noteText = ref('');
const noteBusy = ref(false);

// Refund (admin) — wired in the payments list
const refundFor = ref(null); // payment row
const refundAmount = ref('');
const refundReason = ref('');
const refundBusy = ref(false);

const KIND_LABELS = { online: 'Paid online', desk: 'Paid at desk', comp: 'Complimentary' };
const METHOD_LABELS = { stripe: 'Card (online)', cash: 'Cash', card_terminal: 'Card terminal', comp: 'Comp' };

const canExtend = computed(() => s.value?.disposition === 'active');
const canDepart = computed(() => s.value?.disposition === 'active');

async function load() {
  loadError.value = '';
  try {
    const { data } = await parking.session(props.sessionId);
    s.value = data;
  } catch {
    loadError.value = 'Could not load this session.';
  }
}
onMounted(load);

async function depart() {
  if (!window.confirm(`Mark ${s.value.plate} as departed?`)) return;
  busy.value = true;
  try {
    await parking.depart(s.value.id);
    toast.success(`${s.value.plate} checked out`);
    await load();
    emit('changed');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not check out.');
  } finally {
    busy.value = false;
  }
}

async function submitExtend() {
  busy.value = true;
  try {
    await parking.extend(s.value.id, {
      rate_type: extendDuration.value.rate_type,
      quantity: extendDuration.value.quantity,
      method: extendMethod.value,
    });
    toast.success('Parking extended');
    extendOpen.value = false;
    await load();
    emit('changed');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not extend.');
  } finally {
    busy.value = false;
  }
}

async function addNote() {
  const body = noteText.value.trim();
  if (!body) return;
  noteBusy.value = true;
  try {
    await parking.addNote(s.value.id, body);
    noteText.value = '';
    await load();
  } catch {
    toast.error('Could not add the note.');
  } finally {
    noteBusy.value = false;
  }
}

function openRefund(payment) {
  refundFor.value = payment;
  refundAmount.value = '';
  refundReason.value = '';
}

// Stripe refunds move money by themselves; cash and card-terminal refunds are
// recorded-only — a human still has to open the till or void on the terminal.
const refundIsStripe = computed(() => refundFor.value?.method === 'stripe');

const refundCents = computed(() => {
  const raw = String(refundAmount.value).trim().replace(/^\$/, '');
  if (raw === '') return refundableCents(refundFor.value || {});
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
});

async function submitRefund() {
  const payment = refundFor.value;
  const max = refundableCents(payment);
  const amount = refundCents.value;

  if (amount === null) {
    toast.error('Enter a dollar amount like 12.50, or leave it blank to refund the rest.');
    return;
  }
  if (amount <= 0 || amount > max) {
    toast.error(`Enter an amount between $0.01 and ${formatMoney(max)}.`);
    return;
  }
  if (!refundReason.value.trim()) {
    toast.error('A refund reason is required.');
    return;
  }

  const full = amount === max;
  const confirmMsg = refundIsStripe.value
    ? `Refund ${formatMoney(amount)}${full ? ' (the full remaining amount)' : ''} to the guest's card? Stripe processes this immediately.`
    : `Record a ${formatMoney(amount)}${full ? ' (full)' : ''} ${payment.method === 'cash' ? 'cash' : 'card-terminal'} refund?\n\nThis only writes it to the ledger — you must hand the money back / void on the terminal yourself.`;
  if (!window.confirm(confirmMsg)) return;

  refundBusy.value = true;
  try {
    await parking.refund(s.value.id, {
      payment_id: payment.id,
      reason: refundReason.value.trim(),
      amount_cents: amount,
    });
    toast.success(
      refundIsStripe.value
        ? `${formatMoney(amount)} refunded to the card`
        : `${formatMoney(amount)} refund recorded — hand it to the guest`,
    );
    refundFor.value = null;
    await load();
    emit('changed');
  } catch (err) {
    toast.error(err?.response?.data?.error || 'Could not issue the refund.');
  } finally {
    refundBusy.value = false;
  }
}

// Server-built from PUBLIC_BASE_URL so the link a guest receives always carries
// the public domain, whichever host the agent is signed in on.
const guestLink = computed(() => s.value?.guest_url || '');
const linkCopied = ref(false);

async function copyGuestLink() {
  const ok = await copyText(guestLink.value);
  if (!ok) return toast.error('Could not copy the link.');
  linkCopied.value = true;
  setTimeout(() => (linkCopied.value = false), 1500);
}

function refundableCents(payment) {
  if (payment.type !== 'charge' || payment.status !== 'succeeded' || payment.amount_cents === 0) return 0;
  const refunded = (s.value?.payments || [])
    .filter((p) => p.type === 'refund' && p.status === 'succeeded' && p.refunded_payment_id === payment.id)
    .reduce((sum, p) => sum + p.amount_cents, 0);
  return Math.max(0, payment.amount_cents - refunded);
}
</script>

<template>
  <Modal :title="s ? `${formatPlate(s.plate, s.plate_state)} · ${s.confirmation_code}` : 'Parking session'" @close="emit('close')">
    <p v-if="loadError" class="text-center text-slate-warm">{{ loadError }}</p>
    <div v-else-if="!s" class="h-48 animate-pulse rounded-xl border border-sand bg-white/60" />

    <div v-else class="space-y-5">
      <div class="flex flex-wrap items-center gap-2 text-sm text-slate-warm">
        <ParkingStatusPill :status="s.status" />
        <span>· {{ KIND_LABELS[s.kind] }}</span>
        <span v-if="s.lot">· {{ s.lot }}</span>
        <span class="ml-auto font-medium text-ink">{{ formatMoney(s.net_paid_cents) }} paid</span>
      </div>

      <dl class="grid grid-cols-2 gap-x-6 gap-y-3">
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Guest</dt>
          <dd class="text-ink">{{ s.guest_name }}</dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Phone</dt>
          <dd class="text-ink">{{ s.phone || '—' }}</dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Vehicle</dt>
          <dd class="text-ink">{{ s.vehicle_desc || '—' }}</dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Room</dt>
          <dd class="text-ink">{{ s.room || '—' }}</dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Entered</dt>
          <dd class="text-ink">{{ formatDateTime(s.starts_at || s.created_at) }}</dd>
        </div>
        <div>
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Paid through</dt>
          <dd class="text-ink">{{ s.paid_through ? formatDateTime(s.paid_through) : '—' }}</dd>
        </div>
        <div v-if="s.kind === 'comp'" class="col-span-2">
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Complimentary</dt>
          <dd class="text-ink">{{ s.comp_reason }} — authorized by {{ s.comp_authorized_by }}</dd>
        </div>
        <div v-if="s.created_by_name">
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Created by</dt>
          <dd class="text-ink">{{ s.created_by_name }}</dd>
        </div>
        <div v-if="s.checked_out_at">
          <dt class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Checked out</dt>
          <dd class="text-ink">{{ formatDateTime(s.checked_out_at) }} · {{ s.checked_out_by_name }}</dd>
        </div>
      </dl>

      <!-- The guest's own link. It was already in this payload and simply
           never rendered, so a guest who lost it had no way back and neither
           did the desk — an expiring car became a desk interruption or a tow. -->
      <div v-if="guestLink" class="rounded-xl border border-sand bg-warm/40 p-3">
        <p class="text-[11px] font-medium uppercase tracking-wide text-slate-warm">Guest link</p>
        <div class="mt-1.5 flex items-center gap-2">
          <code class="min-w-0 flex-1 truncate text-xs text-ink">{{ guestLink }}</code>
          <button type="button" class="btn btn-ghost shrink-0 !py-1.5 text-sm" @click="copyGuestLink">
            {{ linkCopied ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-warm">
          Send this to the guest so they can check their time or add more themselves.
        </p>
      </div>

      <!-- Actions -->
      <div v-if="canExtend || canDepart" class="flex gap-2">
        <button v-if="canExtend" class="btn btn-primary flex-1 !py-2" :disabled="busy" @click="extendOpen = !extendOpen">
          Extend
        </button>
        <button v-if="canDepart" class="btn btn-secondary flex-1 !py-2" :disabled="busy" @click="depart">
          Check out vehicle
        </button>
      </div>

      <div v-if="extendOpen" class="rounded-xl border border-sand bg-warm/40 p-4">
        <p class="label">Add time</p>
        <DurationPicker v-if="rates" v-model="extendDuration" :rates="rates" :tax-bps="taxBps" />
        <p v-else class="text-sm text-slate-warm">Rates unavailable.</p>
        <label class="label mt-3" for="ext_method">Paid by</label>
        <select id="ext_method" v-model="extendMethod" class="input">
          <option value="cash">Cash</option>
          <option value="card_terminal">Card terminal</option>
          <option value="comp">Complimentary</option>
        </select>
        <p v-if="rates && extendMethod !== 'comp'" class="mt-3 rounded-xl border border-sand bg-white px-4 py-3 text-sm text-ink">
          Collect <span class="font-semibold">{{ formatMoney(extendTotalCents) }}</span> at the desk.
          <span v-if="extendTaxCents > 0" class="text-slate-warm">
            ({{ formatMoney(extendSubtotalCents) }} + {{ formatMoney(extendTaxCents) }} tax)
          </span>
        </p>
        <button class="btn btn-primary mt-3 w-full" :disabled="busy || !rates" @click="submitExtend">
          {{ busy ? 'Saving…' : 'Confirm extension' }}
        </button>
      </div>

      <!-- Payments -->
      <div>
        <h3 class="mb-2 font-serif text-lg text-ink">Payments</h3>
        <ul class="space-y-2">
          <li
            v-for="p in s.payments"
            :key="p.id"
            class="rounded-xl border border-sand px-4 py-2.5 text-sm"
            :class="p.type === 'refund' ? 'bg-red-50/50' : 'bg-white'"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-ink">
                {{ p.type === 'refund' ? 'Refund' : p.purpose === 'extension' ? 'Extension' : 'Parking' }}
                · {{ METHOD_LABELS[p.method] || p.method }}
                <span v-if="p.status !== 'succeeded'" class="text-slate-warm">({{ p.status }})</span>
              </span>
              <span class="font-medium" :class="p.type === 'refund' ? 'text-red-700' : 'text-ink'">
                {{ p.type === 'refund' ? '−' : '' }}{{ formatMoney(p.amount_cents) }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-warm">
              <span>
                {{ formatDateTime(p.created_at) }}
                <template v-if="p.created_by_name"> · {{ p.created_by_name }}</template>
                <template v-if="p.note"> · {{ p.note }}</template>
              </span>
              <span class="flex shrink-0 gap-2">
                <a
                  v-if="p.receipt_url"
                  :href="p.receipt_url"
                  target="_blank"
                  rel="noopener"
                  class="font-medium text-maroon-700 hover:underline"
                >
                  Receipt
                </a>
                <button
                  v-if="auth.isAdmin && refundableCents(p) > 0"
                  type="button"
                  class="font-medium text-red-700 hover:underline"
                  @click="openRefund(p)"
                >
                  Refund
                </button>
              </span>
            </div>
          </li>
        </ul>
      </div>

      <!-- Refund form (admin) -->
      <div v-if="refundFor" class="rounded-xl border border-red-200 bg-red-50/50 p-4">
        <p class="label">
          Refund {{ formatMoney(refundFor.amount_cents) }}
          {{ refundIsStripe ? 'card payment' : refundFor.method === 'cash' ? 'cash payment' : 'terminal payment' }}
        </p>

        <p v-if="!refundIsStripe" class="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>This records the refund only.</strong>
          You must hand the money back
          {{ refundFor.method === 'cash' ? 'from the till' : 'by voiding on the card terminal' }}
          yourself — the app cannot move it.
        </p>

        <label class="label" for="rf_amount">
          Amount in dollars — blank refunds the remaining {{ formatMoney(refundableCents(refundFor)) }}
        </label>
        <input
          id="rf_amount"
          v-model="refundAmount"
          class="input"
          inputmode="decimal"
          :placeholder="`Full refund (${formatMoney(refundableCents(refundFor))})`"
        />
        <p class="mt-1 text-xs text-slate-warm">
          Will refund <strong>{{ refundCents === null ? '—' : formatMoney(refundCents) }}</strong>
        </p>

        <label class="label mt-3" for="rf_reason">Reason (required)</label>
        <input id="rf_reason" v-model="refundReason" class="input" placeholder="e.g. Guest canceled trip" />
        <div class="mt-3 flex gap-2">
          <button class="btn btn-ghost flex-1" @click="refundFor = null">Cancel</button>
          <button
            class="btn flex-1 border border-red-300 bg-white text-red-700 hover:bg-red-50"
            :disabled="refundBusy"
            @click="submitRefund"
          >
            {{ refundBusy ? 'Working…' : refundIsStripe ? 'Refund to card' : 'Record refund' }}
          </button>
        </div>
      </div>

      <!-- Notes -->
      <div>
        <h3 class="mb-2 font-serif text-lg text-ink">Notes</h3>
        <ul v-if="s.notes.length" class="mb-3 space-y-2">
          <li v-for="n in s.notes" :key="n.id" class="rounded-xl border border-sand bg-warm/40 px-4 py-2.5 text-sm">
            <p class="text-ink">{{ n.body }}</p>
            <p class="mt-0.5 text-xs text-slate-warm">{{ n.author_name }} · {{ formatDateTime(n.created_at) }}</p>
          </li>
        </ul>
        <div class="flex gap-2">
          <input
            v-model="noteText"
            class="input"
            aria-label="Add a note"
            placeholder="Add a note…"
            @keydown.enter.prevent="addNote"
          />
          <button class="btn btn-secondary !py-2" :disabled="noteBusy || !noteText.trim()" @click="addNote">
            Add
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
