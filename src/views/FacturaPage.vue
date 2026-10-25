<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap form">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">Cancelar</button>
          <span class="title">{{ bill ? 'Editar factura' : 'Nueva factura' }}</span>
          <span />
        </div>

        <template v-if="!id || bill">
          <div class="field">
            <label for="factura-nombre" class="rb-label">Nombre</label>
            <input id="factura-nombre" v-model="name" class="name" placeholder="Luz, alquiler, celular…" autocomplete="off" />
          </div>

          <div class="rb-group">
            <label class="rb-row">
              <span class="grow">{{ variable ? 'Monto estimado' : 'Monto' }}</span>
              <input v-model="amountText" class="rb-inline-input big" inputmode="decimal" placeholder="$ 0" aria-label="Monto" @blur="amountText = pretty(amountText)" />
            </label>
            <label class="rb-row">
              <span class="grow"><span>El monto cambia cada mes</span><span class="sub">Como la luz o los gastos comunes</span></span>
              <input v-model="variable" type="checkbox" class="rb-switch" role="switch" />
            </label>
            <label v-if="variable && bill" class="rb-row">
              <span class="grow"><span>Monto de {{ monthName(month) }}</span><span class="sub">Cuando llegue la factura</span></span>
              <input v-model="monthText" class="rb-inline-input" inputmode="decimal" :placeholder="`≈ ${formatPesos(parseAmount(amountText) || 0)}`" aria-label="Monto de este mes" @blur="monthText = pretty(monthText)" />
            </label>
          </div>

          <div class="rb-group">
            <label class="rb-row day">
              <span class="grow">Vence el día</span>
              <span class="value">{{ dueDay }}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg></span>
              <select v-model.number="dueDay" aria-label="Día de vencimiento">
                <option v-for="d in 31" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
            <label class="rb-row">
              <span class="grow"><span>Débito automático</span><span class="sub">Se paga sola: no te aviso antes</span></span>
              <input v-model="autopay" type="checkbox" class="rb-switch" role="switch" />
            </label>
            <label class="rb-row">
              <span class="grow">Nota</span>
              <input v-model="note" class="rb-inline-input ink" placeholder="Pago mínimo, cuota…" aria-label="Nota" />
            </label>
          </div>

          <div class="field">
            <label for="factura-palabras" class="rb-label">Para reconocer el pago</label>
            <input id="factura-palabras" v-model="keywordsText" class="name small" :placeholder="keywordsFor(name).join(', ') || 'ute, luz'" autocomplete="off" />
            <span class="rb-note">Si registrás un gasto con estas palabras y un monto parecido, la factura se marca sola como pagada.</span>
          </div>

          <div class="actions">
            <button type="button" class="rb-btn primary" :disabled="!canSave" @click="save">{{ bill ? 'Guardar cambios' : 'Crear factura' }}</button>
            <button v-if="bill" type="button" class="delete" @click="confirmDelete">Eliminar factura</button>
          </div>
        </template>
        <div v-else class="rb-empty"><span class="t">No encontramos esa factura</span></div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed, ref, watch } from 'vue';
import { keywordsFor } from '@/domain/bills';
import { monthKey, monthName, todayIso } from '@/domain/dates';
import { formatPesos, parseAmount } from '@/domain/money';
import { useFinanzasStore } from '@/stores/finanzas';

/** Sin `id` (ruta /facturas/nueva), es una factura nueva. */
const props = defineProps<{ id?: string }>();
const router = useIonRouter();
const finanzas = useFinanzasStore();

const month = monthKey(todayIso());
const bill = computed(() => (props.id ? finanzas.bills.find((b) => b.id === props.id) : undefined));

const name = ref('');
const amountText = ref('');
const variable = ref(false);
const monthText = ref('');
const dueDay = ref(10);
const autopay = ref(false);
const note = ref('');
const keywordsText = ref('');

/** "2150" → "$ 2.150" al salir del campo. */
function pretty(text: string): string {
  const n = parseAmount(text);
  return n > 0 ? formatPesos(n) : '';
}

function load() {
  const b = bill.value;
  if (!b) return;
  name.value = b.name;
  amountText.value = formatPesos(b.amount);
  variable.value = !!b.variable;
  monthText.value = b.amounts?.[month] !== undefined ? formatPesos(b.amounts[month]) : '';
  dueDay.value = b.dueDay;
  autopay.value = !!b.autopay;
  note.value = b.note ?? '';
  keywordsText.value = b.keywords.join(', ');
}
watch(bill, load, { immediate: true });

const amount = computed(() => parseAmount(amountText.value) || 0);
const canSave = computed(() => !!name.value.trim() && amount.value > 0);

function keywords(): string[] {
  const typed = keywordsText.value
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return typed.length ? typed : keywordsFor(name.value);
}

async function save() {
  if (!canSave.value) return;
  const data = {
    name: name.value.trim(),
    amount: amount.value,
    variable: variable.value,
    dueDay: dueDay.value,
    autopay: autopay.value,
    note: note.value.trim() || undefined,
    keywords: keywords(),
  };
  if (bill.value) {
    await finanzas.updateBill(bill.value.id, data);
    const thisMonth = parseAmount(monthText.value);
    if (variable.value && thisMonth > 0) await finanzas.setBillAmount(bill.value.id, month, thisMonth);
  } else {
    await finanzas.addBill(data);
  }
  goBack();
}

async function confirmDelete() {
  const b = bill.value;
  if (!b) return;
  const alert = await alertController.create({
    header: `¿Eliminar ${b.name}?`,
    message: 'Deja de aparecer en Facturas y no te aviso más. Los gastos que registraste para pagarla quedan.',
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });
  await alert.present();
  if ((await alert.onDidDismiss()).role !== 'destructive') return;
  await finanzas.removeBill(b.id);
  goBack();
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/inicio/facturas', 'back', 'replace');
}
</script>

<style scoped>
.form { min-height: 100%; box-sizing: border-box; gap: 16px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 18px); }
.field { display: flex; flex-direction: column; gap: 8px; }
.name { height: 52px; padding: 0 14px; border-radius: 14px; border: 0; background: #fff; color: var(--rb-ink); font-size: 17px; outline: none; }
.name.small { font-size: 16px; }
.name::placeholder { color: var(--rb-icon); }
.rb-inline-input.big { font-size: 20px; font-weight: 600; color: var(--rb-ink); }
.rb-inline-input.ink { color: var(--rb-ink); }
.rb-row.day { position: relative; cursor: pointer; }
.rb-row.day select { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.actions .rb-btn { min-height: 54px; font-size: 16px; }
.rb-wrap .delete { height: 44px; color: var(--rb-danger); font-size: 16px; font-weight: 500; text-align: center; }
</style>
