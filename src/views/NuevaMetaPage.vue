<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap form">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">Cancelar</button>
          <span class="title">Nueva meta de ahorro</span>
          <span />
        </div>

        <div class="field">
          <label for="nombre-meta" class="rb-label">Nombre</label>
          <input id="nombre-meta" ref="nameInput" v-model="name" class="name" placeholder="Para qué ahorrás" autocomplete="off" />
          <div class="chips">
            <button v-for="p in PRESETS" :key="p.chip" type="button" class="rb-chip" :class="{ on: preset === p.chip }" :aria-pressed="preset === p.chip" @click="pickPreset(p)">{{ p.chip }}</button>
          </div>
        </div>

        <div class="rb-group">
          <label class="rb-row">
            <span class="grow">Monto objetivo</span>
            <input v-model="targetText" class="rb-inline-input big" inputmode="decimal" placeholder="$ 0" aria-label="Monto objetivo" @blur="targetText = pretty(targetText)" />
          </label>
          <label class="rb-row">
            <span class="grow">Ya tengo ahorrado</span>
            <input v-model="savedText" class="rb-inline-input" inputmode="decimal" placeholder="$ 0" aria-label="Ya tengo ahorrado" @blur="savedText = pretty(savedText)" />
          </label>
          <label class="rb-row month">
            <span class="grow">Para cuándo</span>
            <span class="value">{{ deadline ? capitalize(monthLabel(deadline)) : 'Elegí el mes' }}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg></span>
            <input v-model="deadline" type="month" :min="nextMonth" aria-label="Para cuándo" />
          </label>
          <button type="button" class="rb-row" @click="pickWhere">
            <span class="grow">Dónde lo guardás</span>
            <span class="value">{{ where }}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg></span>
          </button>
        </div>

        <div v-if="plan" class="plan">
          <span class="k">Para llegar a tiempo</span>
          <span class="v rb-amount">{{ formatPesos(plan.monthly) }} por mes</span>
          <span class="d">{{ plan.months === 1 ? '1 aporte' : `${plan.months} aportes` }} · te faltan {{ formatPesos(plan.remaining) }}</span>
        </div>
        <div v-else-if="target > 0 && saved >= target" class="plan">
          <span class="k">Ya llegaste</span>
          <span class="d">Lo que tenés ahorrado cubre la meta.</span>
        </div>

        <label class="remind">
          <span class="grow"><span>Recordarme el aporte</span><span class="s">El día 1 de cada mes</span></span>
          <input v-model="remind" type="checkbox" class="rb-switch" role="switch" @change="onRemind" />
        </label>

        <button type="button" class="rb-btn primary create" :disabled="!canCreate" @click="create">Crear meta</button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { actionSheetController, alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed, nextTick, ref } from 'vue';
import { billsForMonth } from '@/domain/bills';
import { monthKey, monthLabel, shiftMonth, todayIso } from '@/domain/dates';
import { monthlyToReach } from '@/domain/goals';
import { formatPesos, parseAmount } from '@/domain/money';
import { enableReminders } from '@/services/reminders';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';

const router = useIonRouter();
const finanzas = useFinanzasStore();
const gastos = useGastosStore();

const today = todayIso();
const nextMonth = shiftMonth(monthKey(today), 1);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Las metas de siempre: tocarlas pone el nombre. "Otra" deja escribirlo. */
const PRESETS = [
  { chip: 'Emergencias', name: 'Fondo de emergencia' },
  { chip: 'Vacaciones', name: 'Vacaciones' },
  { chip: 'Auto', name: 'Auto' },
  { chip: 'Otra', name: '' },
];
const PLACES = ['Caja de ahorro', 'Cuenta en dólares', 'Efectivo'];

const name = ref('');
const preset = ref<string>();
const targetText = ref('');
const savedText = ref('');
const deadline = ref(shiftMonth(monthKey(today), 12));
const where = ref('Caja de ahorro');
const remind = ref(false);
const nameInput = ref<HTMLInputElement>();

const target = computed(() => parseAmount(targetText.value) || 0);
const saved = computed(() => parseAmount(savedText.value) || 0);
const plan = computed(() => {
  if (!(target.value > 0) || !deadline.value || saved.value >= target.value) return undefined;
  return monthlyToReach({ target: target.value, saved: saved.value, today, deadline: deadline.value });
});
const canCreate = computed(() => !!name.value.trim() && target.value > 0);

/** "60000" → "$ 60.000" al salir del campo. */
function pretty(text: string): string {
  const n = parseAmount(text);
  return n > 0 ? formatPesos(n) : '';
}

async function pickPreset(p: { chip: string; name: string }) {
  preset.value = p.chip;
  name.value = p.name;
  if (!p.name) {
    await nextTick();
    nameInput.value?.focus();
  }
}

async function pickWhere() {
  const sheet = await actionSheetController.create({
    header: 'Dónde lo guardás',
    buttons: [
      ...PLACES.map((p) => ({ text: p, handler: () => void (where.value = p) })),
      { text: 'Otro lugar…', handler: () => void askWhere() },
      { text: 'Cancelar', role: 'cancel' },
    ],
  });
  await sheet.present();
}

async function askWhere() {
  const a = await alertController.create({
    header: 'Dónde lo guardás',
    inputs: [{ name: 'where', type: 'text', placeholder: 'Plazo fijo, alcancía…' }],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Listo', role: 'confirm' }],
  });
  await a.present();
  const { role, data } = await a.onDidDismiss<{ values: { where: string } }>();
  if (role === 'confirm' && data?.values.where.trim()) where.value = data.values.where.trim();
}

/** Prender el aviso pide permiso para notificar; sin permiso queda apagado. */
async function onRemind() {
  if (remind.value) remind.value = await enableReminders();
}

async function create() {
  if (!canCreate.value) return;
  const emergency =
    preset.value === 'Emergencias'
      ? { monthlyFixed: Math.round(billsForMonth(finanzas.bills, monthKey(today), gastos.tickets, today).total), months: 6 }
      : undefined;
  await finanzas.addGoal(
    {
      name: name.value.trim(),
      currency: 'UYU',
      target: target.value,
      monthly: plan.value?.monthly ?? 0,
      where: where.value,
      deadline: deadline.value || undefined,
      remind: remind.value,
      ...(emergency ? { emergency } : {}),
    },
    saved.value,
    today,
  );
  goBack();
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/metas', 'back', 'replace');
}
</script>

<style scoped>
.form { min-height: 100%; box-sizing: border-box; gap: 16px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); }
.field { display: flex; flex-direction: column; gap: 8px; }
.name { height: 52px; padding: 0 14px; border-radius: 14px; border: 0; background: #fff; color: var(--rb-ink); font-size: 17px; outline: none; }
.name::placeholder { color: var(--rb-icon); }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chips .rb-chip { padding: 0 14px; }
.rb-inline-input { color: var(--rb-muted); }
.rb-inline-input.big { font-size: 20px; font-weight: 600; color: var(--rb-ink); }
.rb-row.month { position: relative; cursor: pointer; }
.rb-row.month input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.plan { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 14px; background: #eaf6f0; }
.plan .k { font-size: 14px; color: var(--rb-accent-dark); }
.plan .v { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; }
.plan .d { font-size: 14px; color: var(--rb-ink-3); }
.remind { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 0 14px; border-radius: 14px; background: #fff; font-size: 16px; cursor: pointer; }
.remind .grow { display: flex; flex-direction: column; gap: 2px; }
.remind .s { font-size: 14px; color: var(--rb-muted); }
.create { margin-top: auto; min-height: 54px; font-size: 16px; }
</style>
