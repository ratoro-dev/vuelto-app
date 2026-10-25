<template>
  <button type="button" class="rb-row gasto" :class="{ tall, picked: selecting && selected }" :aria-pressed="selecting ? selected : undefined" @click="emit('open', ticket.id)">
    <!-- Eligiendo varios para borrar: un círculo que se marca -->
    <span v-if="selecting" class="check" :class="{ on: selected }" aria-hidden="true">
      <svg v-if="selected" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
    </span>
    <span v-else-if="icon" class="rb-icon-circle"><category-icon :category="category" :size="17" /></span>
    <span class="grow">
      <span class="name">{{ ticket.store }}</span>
      <span class="sub">{{ subtitle ?? `${income ? 'Ingreso' : fixed ? 'Gasto fijo' : label} · ${ticket.billId ? 'Factura' : SOURCE_LABEL[ticket.source]}` }}</span>
    </span>
    <span v-if="ticket.review && !net" class="review rb-attention">Revisar monto</span>
    <span v-else class="end">
      <!-- Los gastos restan y los ingresos suman, como en la cuenta -->
      <span class="rb-amount money" :class="{ income }">{{ ticket.usd ? formatUsd(income ? ticket.usd.amount : -ticket.usd.amount, { sign: true }) : formatPesos(income ? net : -net, { sign: true }) }}</span>
      <sync-icon v-if="ticket.review" state="revisar" />
      <sync-icon v-else-if="showSync && ticket.sync.state === 'pendiente'" :state="sync.syncing && sync.online ? 'subiendo' : 'telefono'" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import SyncIcon from '@/components/SyncIcon.vue';
import { categoryLabel, SOURCE_LABEL } from '@/domain/categories';
import { formatPesos, formatUsd } from '@/domain/money';
import { isIncome, mainCategory, ticketTotals } from '@/domain/totals';
import type { Ticket } from '@/domain/types';
import { useSyncStore } from '@/stores/sync';

const props = withDefaults(
  defineProps<{
    ticket: Ticket;
    subtitle?: string;
    showSync?: boolean;
    icon?: boolean;
    tall?: boolean;
    selecting?: boolean;
    selected?: boolean;
    /** Es el pago de una factura: se marca "Gasto fijo" (no sale del presupuesto). */
    fixed?: boolean;
  }>(),
  { subtitle: undefined, showSync: true, icon: true, tall: false, selecting: false, selected: false, fixed: false },
);
const emit = defineEmits<{ open: [id: string] }>();
const sync = useSyncStore();

const category = computed(() => mainCategory(props.ticket));
const label = computed(() => categoryLabel(category.value, props.ticket.lines.find((l) => l.category === category.value)?.subcategory));
const net = computed(() => ticketTotals(props.ticket).net);
const income = computed(() => isIncome(props.ticket));
</script>

<style scoped>
.gasto.tall { min-height: 60px; }
.name { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.money { font-size: 16px; font-weight: 500; }
.money.income { color: var(--rb-accent); }
.check { width: 24px; height: 24px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--rb-neutral-border); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.check.on { background: var(--rb-accent); box-shadow: none; }
.review { font-size: 14px; font-weight: 600; white-space: nowrap; }
</style>
