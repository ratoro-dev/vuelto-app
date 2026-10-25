<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap metas">
        <div class="head">
          <h1 class="rb-title" style="padding: 0">Metas</h1>
          <button type="button" class="rb-round" aria-label="Nueva meta de ahorro" @click="newGoal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        <div class="rb-segment" role="tablist">
          <button type="button" role="tab" aria-selected="true" class="on">Ahorro y deudas</button>
          <button type="button" role="tab" aria-selected="false" @click="router.push('/tabs/metas/inversion')">Inversión</button>
        </div>

        <div class="rb-section">
          <span class="section-title"><span class="icon" style="background: var(--rb-accent)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></span>Ahorro</span>
          <div class="rb-group">
            <button v-for="g in goals" :key="g.goal.id" type="button" class="rb-stack goal" @click="router.push(`/tabs/metas/ahorro/${g.goal.id}`)">
              <span class="line"><span>{{ g.goal.name }}</span><span style="font-weight: 500">{{ Math.round(g.progress.share * 100) }}%</span></span>
              <span class="bar"><span :style="{ width: `${g.progress.share * 100}%` }" /></span>
              <span class="meta"><span>{{ g.saved }}</span><span>{{ g.pace }}</span></span>
            </button>
            <div v-if="!goals.length" class="rb-row rb-muted">Todavía no tenés metas. Tocá + para crear una.</div>
          </div>
        </div>

        <div v-if="owed.length" class="rb-section">
          <div class="rb-section-head">
            <span class="section-title"><span class="icon" style="background: var(--rb-warn)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg></span>Lo que debés</span>
            <span class="rb-small">{{ formatPesos(summary.owed) }}</span>
          </div>
          <div class="rb-group">
            <button v-for="d in owed" :key="d.id" type="button" class="rb-stack debt" @click="openDebt(d)">
              <span class="debt-line">
                <span class="grow-col">
                  <span>{{ d.name }}</span>
                  <span class="sub" :class="{ 'rb-warn': d.kind === 'tarjeta' && dueSoon(d) }">{{ nextPaymentText(d) }}</span>
                </span>
                <span class="rb-amount" style="font-weight: 500">{{ formatPesos(d.balance) }}</span>
              </span>
              <span v-if="d.installments" class="bar ink"><span :style="{ width: `${(d.installments.paid / d.installments.total) * 100}%` }" /></span>
            </button>
          </div>
        </div>

        <div v-if="owedToMe.length" class="rb-section">
          <span class="section-title"><span class="icon" style="background: var(--rb-blue)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg></span>Te deben</span>
          <div v-for="d in owedToMe" :key="d.id" class="rb-card owed-card">
            <div class="debt-line">
              <span class="grow-col"><span class="name">{{ d.name.replace(/^Te debe /, 'Préstamo a ') }}</span><span class="sub">{{ d.since ? `Desde el ${longDate(d.since).replace(/ de \d{4}$/, '')}` : '' }}</span></span>
              <span class="rb-amount name" style="font-weight: 500">{{ formatPesos(d.balance) }}</span>
            </div>
            <button type="button" class="rb-btn neutral" @click="collect(d)">Marcar como cobrado</button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { actionSheetController, alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed } from 'vue';
import { daysBetween, longDate, MESES, todayIso, weekday } from '@/domain/dates';
import { debtsSummary, goalProgress, nextDebtPayment, type Debt } from '@/domain/goals';
import { formatPesos, formatUsd, parseAmount } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';

const router = useIonRouter();
const finanzas = useFinanzasStore();
const today = computed(() => todayIso());

const fmt = (currency: 'UYU' | 'USD', n: number) => (currency === 'USD' ? formatUsd(n) : formatPesos(n));
/** "oct 2027", o solo "ene" si es dentro de este año o los próximos 12 meses. */
function etaText(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const short = MESES[m - 1].slice(0, 3);
  const months = (y - Number(today.value.slice(0, 4))) * 12 + (m - Number(today.value.slice(5, 7)));
  return months <= 12 ? short : `${short} ${y}`;
}
const goals = computed(() =>
  finanzas.goals.map((goal) => {
    const progress = goalProgress(goal, today.value);
    const saved = `${fmt(goal.currency, progress.saved)} de ${fmt(goal.currency, goal.target)}`;
    let pace = 'Cumplida';
    if (progress.remaining > 0) {
      pace = goal.monthly
        ? `Aporte sugerido ${fmt(goal.currency, goal.monthly)}/mes${progress.etaMonth ? ` → ${etaText(progress.etaMonth)}` : ''}`
        : 'Definí un aporte mensual';
    }
    return { goal, progress, saved, pace };
  }),
);
const summary = computed(() => debtsSummary(finanzas.debts));
const owed = computed(() => finanzas.debts.filter((d) => d.kind !== 'me-deben' && d.balance > 0));
const owedToMe = computed(() => finanzas.debts.filter((d) => d.kind === 'me-deben' && d.balance > 0));

const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/** "vie 9" en la semana que viene, "20 oct" más adelante. */
function payDay(date: string): string {
  const left = daysBetween(today.value, date);
  if (left >= 0 && left < 7) return `${DAYS[weekday(date)]} ${Number(date.slice(8, 10))}`;
  return `${Number(date.slice(8, 10))} ${MESES[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;
}
function nextPaymentText(d: Debt): string {
  const next = nextDebtPayment(d, today.value);
  const parts = [next ? `Próximo pago: ${payDay(next)}` : ''];
  if (d.minimum) parts.push(`mínimo ${formatPesos(d.minimum)}`);
  if (d.installments) parts.push(`cuota ${Math.min(d.installments.paid + 1, d.installments.total)} de ${d.installments.total}`, formatPesos(d.installments.amount));
  return parts.filter(Boolean).join(' · ');
}
const dueSoon = (d: Debt) => {
  const next = nextDebtPayment(d, today.value);
  return !!next && daysBetween(today.value, next) <= 3;
};

async function askAmount(header: string, message: string, value?: number): Promise<number | undefined> {
  const alert = await alertController.create({
    header,
    message,
    inputs: [{ name: 'amount', type: 'text', placeholder: '$ 0', value: value ? String(value).replace('.', ',') : '', attributes: { inputmode: 'decimal' } }],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Guardar', role: 'confirm' }],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { amount: string } }>();
  if (role !== 'confirm') return undefined;
  const n = parseAmount(data?.values.amount ?? '');
  return n > 0 ? n : undefined;
}

/** Tocar una deuda: registrar un pago (o ver las facturas, si es la tarjeta). */
async function openDebt(d: Debt) {
  const suggested = d.kind === 'tarjeta' ? d.minimum : d.installments?.amount;
  const sheet = await actionSheetController.create({
    header: d.name,
    buttons: [
      { text: 'Registrar un pago', handler: () => void pay(d, suggested) },
      ...(d.kind === 'tarjeta' ? [{ text: 'Ver facturas', handler: () => void router.push('/tabs/inicio/facturas') }] : []),
      { text: 'Cancelar', role: 'cancel' },
    ],
  });
  await sheet.present();
}

async function pay(d: Debt, suggested?: number) {
  const n = await askAmount(d.name, '¿Cuánto pagaste?', suggested);
  if (n) await finanzas.payDebt(d.id, n);
}

/** "Marcar como cobrado": cobrado todo; si fue una parte, se puede escribir cuánto. */
async function collect(d: Debt) {
  const n = await askAmount(d.name, '¿Cuánto te devolvió?', d.balance);
  if (n) await finanzas.payDebt(d.id, n);
}

function newGoal() {
  router.push('/tabs/metas/nueva');
}

</script>

<style scoped>
.metas { gap: 14px; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 8px 4px 0; }
.section-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--rb-ink-3); text-transform: uppercase; letter-spacing: 0.04em; padding: 0 4px; }
.section-title .icon { width: 24px; height: 24px; border-radius: 7px; display: flex; align-items: center; justify-content: center; }
.rb-section-head .section-title { padding: 0; }
.rb-wrap .goal, .rb-wrap .debt { width: 100%; text-align: left; gap: 6px; padding: 12px 0; }
.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 15px; }
.bar { display: block; height: 4px; border-radius: 2px; background: var(--rb-line); overflow: hidden; }
.bar > span { display: block; height: 100%; border-radius: 2px; background: var(--rb-accent); }
.bar.ink > span { background: var(--rb-ink); }
.meta { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--rb-muted); }
/* "$ 18.000 de $ 60.000" entero a la izquierda; el aporte sugerido baja de renglón si no entra */
.meta > span:first-child { white-space: nowrap; flex-shrink: 0; }
.meta > span:last-child { min-width: 0; text-align: right; }
.debt-line { display: flex; align-items: center; gap: 12px; font-size: 15px; }
.grow-col { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.grow-col .sub { font-size: 13px; color: var(--rb-muted); }
.owed-card { padding: 12px 14px; gap: 10px; }
.owed-card .name { font-size: 16px; }
</style>
