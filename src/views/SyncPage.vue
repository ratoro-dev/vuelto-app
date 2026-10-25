<template>
  <ion-page>
    <ion-content class="rb-page">
      <div class="rb-wrap sync-page">
        <div class="rb-navbar">
          <button type="button" class="rb-navlink" @click="goBack">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>Movimientos
          </button>
          <span class="title">Sincronización</span>
          <span />
        </div>

        <div class="rb-card status">
          <div class="line">
            <span class="state"><span class="rb-dot" :style="{ width: '8px', height: '8px', background: sync.online ? 'var(--rb-accent)' : 'var(--rb-warn-dot)' }" />{{ headline }}</span>
            <span class="rb-small">{{ counts.synced }} de {{ counts.total }} subidos</span>
          </div>
          <div class="segments" role="img" :aria-label="`${counts.synced} sincronizados, ${counts.uploading} subiendo, ${counts.phone} en el teléfono, ${counts.review} para revisar`">
            <span v-for="s in segments" :key="s.key" :style="{ flexGrow: s.n, background: s.color }" />
          </div>
          <div class="legend">
            <span v-for="s in segments" :key="s.key"><i :style="{ background: s.color }" />{{ s.label }} · {{ s.n }}</span>
          </div>
          <button type="button" class="rb-btn soft" style="align-self: flex-start" :disabled="!sync.online || sync.syncing" @click="sync.syncNow()">
            {{ sync.syncing ? 'Sincronizando…' : 'Sincronizar ahora' }}
          </button>
        </div>

        <!-- Lo único que pide acción -->
        <div v-if="review" class="attention">
          <span class="head">Necesita tu atención</span>
          <div>
            <span class="t">{{ review.store }}</span>
            <span class="s">{{ review.review }}. No se sube hasta que lo confirmes.</span>
          </div>
          <button type="button" class="fix-btn" @click="open(review.id)">Revisar gasto</button>
        </div>

        <div v-if="inProgress.length" class="rb-section">
          <span class="rb-label">En curso</span>
          <div class="rb-group">
            <button v-for="t in inProgress" :key="t.id" type="button" class="rb-row" @click="open(t.id)">
              <span class="grow"><span>{{ t.store }} · {{ formatPesos(ticketTotals(t).net) }}</span><span class="sub">{{ SOURCE_LABEL[t.source] }}</span></span>
              <span class="progress-text" :class="{ up: uploading }">{{ uploading ? 'Subiendo…' : 'En el teléfono' }}</span>
            </button>
          </div>
        </div>

        <button v-if="syncedToday.length" type="button" class="today" @click="router.push('/tabs/movimientos')">
          <sync-icon state="sincronizado" />
          <span class="grow">{{ syncedToday.length }} {{ syncedToday.length === 1 ? 'sincronizado' : 'sincronizados' }} hoy</span>
          <span class="rb-small names">{{ syncedToday.slice(0, 2).map((t) => t.store).join(', ') }}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>

        <span class="rb-note">Tus gastos se guardan en el teléfono y se suben solos cuando hay conexión, sin duplicarse. {{ lastSyncText }}.</span>

        <div class="rb-section tests">
          <span class="rb-label">Pruebas</span>
          <div class="rb-group">
            <label class="rb-row">
              <span class="grow"><span>Simular sin señal</span><span class="sub">El servidor del bot todavía es simulado</span></span>
              <input type="checkbox" class="rb-switch" :checked="sync.simulateOffline" @change="sync.setSimulateOffline(($event.target as HTMLInputElement).checked)" />
            </label>
            <button type="button" class="rb-row link-row" @click="confirmReset">Volver a los datos de ejemplo</button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { alertController, IonContent, IonPage, useIonRouter } from '@ionic/vue';
import { computed } from 'vue';
import SyncIcon from '@/components/SyncIcon.vue';
import { SOURCE_LABEL } from '@/domain/categories';
import { relativeDay, timeOf, todayIso } from '@/domain/dates';
import { formatPesos } from '@/domain/money';
import { ticketTotals } from '@/domain/totals';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';
import { useSyncStore } from '@/stores/sync';

const router = useIonRouter();
const gastos = useGastosStore();
const finanzas = useFinanzasStore();
const sync = useSyncStore();

const today = computed(() => todayIso());
const syncedToday = computed(() => gastos.todayTickets.filter((t) => t.sync.state === 'subido'));
const review = computed(() => gastos.toReview[0]);
const inProgress = computed(() => gastos.pending);
const uploading = computed(() => sync.online && sync.syncing);

/** Lo de hoy más lo que todavía no subió, sea del día que sea. */
const counts = computed(() => {
  const synced = syncedToday.value.length;
  const pending = gastos.pending.length;
  const reviewN = gastos.toReview.length;
  return {
    synced,
    uploading: uploading.value ? pending : 0,
    phone: uploading.value ? 0 : pending,
    review: reviewN,
    total: synced + pending + reviewN,
  };
});

const segments = computed(() =>
  [
    { key: 'ok', label: 'Sincronizado', n: counts.value.synced, color: 'var(--rb-accent)' },
    { key: 'up', label: 'Subiendo', n: counts.value.uploading, color: '#7fb9a3' },
    { key: 'tel', label: 'En el teléfono', n: counts.value.phone, color: 'var(--rb-neutral-border)' },
    { key: 'rev', label: 'Requiere revisión', n: counts.value.review, color: 'var(--rb-warn)' },
  ].filter((s) => s.n > 0),
);

const headline = computed(() => {
  if (!sync.online) return 'Sin conexión';
  if (uploading.value) return 'Volvió la conexión';
  return gastos.pending.length ? 'Conectado' : 'Todo al día';
});

/** "Última sincronización: hoy, 12:31". */
const lastSyncText = computed(() => {
  const at = sync.lastSyncAt;
  if (!at) return 'Todavía no se sincronizó';
  return `Última sincronización: ${relativeDay(todayIso(new Date(at)), today.value).toLowerCase()}, ${timeOf(at)}`;
});

function open(id: string) {
  router.push(`/tabs/movimientos/gasto/${id}`);
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/tabs/movimientos', 'back', 'replace');
}

async function confirmReset() {
  const alert = await alertController.create({
    header: '¿Volver a los datos de ejemplo?',
    message: 'Se borra lo que registraste en este teléfono y el servidor simulado vuelve a empezar.',
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      {
        text: 'Volver',
        role: 'destructive',
        handler: async () => {
          await Promise.all([gastos.resetDemo(), finanzas.resetDemo(), sync.resetDemo()]);
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
.sync-page { gap: 16px; }
.status .line { display: flex; justify-content: space-between; align-items: center; }
.state { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 500; }
.segments { display: flex; height: 8px; border-radius: 4px; overflow: hidden; gap: 2px; background: var(--rb-line); }
.segments span { display: block; }
.legend { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; font-size: 13px; color: var(--rb-muted); }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.attention { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 14px; background: var(--rb-attention); }
.attention .head { font-size: 14px; font-weight: 600; color: var(--rb-attention-ink); text-transform: uppercase; letter-spacing: 0.04em; }
.attention > div { display: flex; flex-direction: column; gap: 3px; }
.attention .t { font-size: 17px; font-weight: 600; }
.attention .s { font-size: 14px; color: var(--rb-attention-ink); }
.rb-wrap .fix-btn { height: 48px; border-radius: 12px; background: #fff; color: var(--rb-ink); font-size: 16px; font-weight: 600; text-align: center; }
.progress-text { font-size: 14px; font-weight: 500; color: var(--rb-muted); white-space: nowrap; }
.progress-text.up { color: #2e7a60; }
.rb-wrap .today { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 14px; border-radius: 14px; background: #fff; }
.today .grow { flex-grow: 1; font-size: 16px; }
.names { max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tests { margin-top: 12px; }
.rb-wrap .link-row { color: var(--rb-accent); }
</style>
