<template>
  <ion-content class="camara-content" :class="{ live: scanning }">
    <div v-if="step === 'camara'" class="camara" :class="{ live: scanning }">
      <div class="top">
        <button type="button" class="round" aria-label="Cerrar" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <span class="title">Escanear</span>
        <button v-if="torch" type="button" class="round end" :class="{ on: torchOn }" aria-label="Linterna" :aria-pressed="torchOn" @click="toggleTorch">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h10l-2 6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8z" /></svg>
        </button>
        <span v-else />
      </div>

      <div class="viewport" :class="{ hole: scanning }">
        <!-- En el navegador no hay cámara: un ticket de ejemplo, como en la propuesta -->
        <div v-if="!native" class="paper" aria-hidden="true">
          <i class="w60 strong c" /><i class="w80 c" /><i class="rule" /><i class="w90" /><i class="w70" /><i class="w85" /><i class="w60" /><i class="w75" /><i class="w45 strong r" />
          <span class="qr" />
        </div>
        <div v-if="!native" class="demo">
          <button type="button" class="demo-btn" @click="useDemoQr">Simular QR</button>
          <button type="button" class="demo-btn" @click="pasteQr">Pegar QR</button>
          <button type="button" class="demo-btn" @click="useDemoPaper">Ticket de ejemplo</button>
        </div>
        <div v-if="denied" class="message">
          <span>Para leer el QR del ticket, Rumbo necesita la cámara.</span>
          <button type="button" class="demo-btn" @click="openSettings">Abrir Ajustes</button>
        </div>

        <span v-if="added" class="added" role="status">Agregado a la carga · {{ added }}</span>

        <div v-if="detected" class="found">
          <span class="ok"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg></span>
          <span class="grow">
            <span class="t">{{ detected.duplicate ? 'Este ticket ya está ' + detected.duplicate : 'QR de la DGI detectado' }}</span>
            <span class="s">1 ticket · {{ detected.store }} · {{ formatPesos(detected.header.total) }}</span>
          </span>
          <button type="button" class="use" @click="useQr">Usar QR</button>
        </div>
        <div v-else-if="notDgi" class="found muted" role="status">
          <span class="grow"><span class="t">Ese QR no es de un ticket de la DGI</span><span class="s">{{ notDgi }}</span></span>
        </div>
      </div>

      <span class="hint">Con QR se lee solo. Sin QR, sacá foto del ticket entero.<br />Después de agregar, la cámara sigue abierta para el próximo.</span>

      <div class="bottom">
        <button type="button" class="gallery" aria-label="Elegir de la galería" :disabled="busy" @click="fromGallery">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
        </button>
        <button type="button" class="shutter" aria-label="Sacar foto del ticket en papel" :disabled="busy" @click="shoot"><span /></button>
        <span />
      </div>
    </div>

    <ticket-qr v-else-if="step === 'qr'" @back="toCamera()" @added="toCamera" @split="step = 'papel'" />
    <ticket-papel v-else @back="step = carga.photo?.qr ? 'qr' : 'camara'" @added="toCamera" />
  </ion-content>
</template>

<script setup lang="ts">
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { alertController, IonContent } from '@ionic/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TicketPapel from '@/components/registrar/TicketPapel.vue';
import TicketQr from '@/components/registrar/TicketQr.vue';
import { DEMO_SCAN } from '@/data/seed';
import { parseCfeQr } from '@/domain/cfe';
import { formatPesos } from '@/domain/money';
import type { CfeHeader } from '@/domain/types';
import { pickImageFile, takePaperPhoto } from '@/services/paperCapture';
import { useCargaStore } from '@/stores/carga';
import { useGastosStore } from '@/stores/gastos';

const emit = defineEmits<{ close: [] }>();

const gastos = useGastosStore();
const carga = useCargaStore();
const native = Capacitor.isNativePlatform();

const step = ref<'camara' | 'qr' | 'papel'>('camara');
const scanning = ref(false);
const denied = ref(false);
const torch = ref(false);
const torchOn = ref(false);
const busy = ref(false);
/** El QR que se ve ahora, con lo que se sabe de su comercio. */
const scanned = ref<{ header: CfeHeader; warnings: string[] }>();
const notDgi = ref('');
/** Lo último agregado, para confirmarlo sin cerrar la cámara. */
const added = ref('');
let listeners: PluginListenerHandle[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

const detected = computed(() => {
  const s = scanned.value;
  if (!s) return undefined;
  const duplicate = gastos.findByCfe(s.header) ? 'guardado' : carga.hasCfe(s.header) ? 'en la carga' : '';
  return { header: s.header, store: gastos.storeNameFor(s.header.rut)?.name ?? 'Comercio nuevo', duplicate };
});

function flash(target: typeof notDgi | typeof added, text: string) {
  target.value = text;
  clearTimeout(timer);
  timer = setTimeout(() => {
    notDgi.value = '';
    added.value = '';
  }, 3500);
}

function onQr(content: string) {
  const r = parseCfeQr(content);
  if (!r.ok) {
    if (!scanned.value) flash(notDgi, r.error);
    return;
  }
  notDgi.value = '';
  scanned.value = { header: r.header, warnings: r.warnings };
}

/**
 * La cámara en vivo: el escáner de ML Kit dibuja la imagen detrás de la app y la pantalla se vuelve
 * transparente (clase rb-scanning en <html>, ver app.css), salvo esta vista.
 */
async function startScan() {
  if (!native || scanning.value || step.value !== 'camara') return;
  try {
    let perm = await BarcodeScanner.checkPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') perm = await BarcodeScanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') {
      denied.value = true;
      return;
    }
    denied.value = false;
    listeners = [
      await BarcodeScanner.addListener('barcodesScanned', (e) => {
        const value = e.barcodes.find((b) => b.rawValue)?.rawValue;
        if (value) onQr(value);
      }),
    ];
    document.documentElement.classList.add('rb-scanning');
    scanning.value = true;
    await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
    torch.value = (await BarcodeScanner.isTorchAvailable()).available;
  } catch (e) {
    console.warn('Cámara', e);
    await stopScan();
  }
}

async function stopScan() {
  document.documentElement.classList.remove('rb-scanning');
  const was = scanning.value;
  scanning.value = false;
  torchOn.value = false;
  for (const l of listeners) await l.remove();
  listeners = [];
  if (was) await BarcodeScanner.stopScan().catch(() => undefined);
}

async function toggleTorch() {
  await BarcodeScanner.toggleTorch();
  torchOn.value = !torchOn.value;
}

function openSettings() {
  void BarcodeScanner.openSettings();
}

function useQr() {
  if (!scanned.value) return;
  carga.qr = scanned.value;
  scanned.value = undefined;
  step.value = 'qr';
}

function useDemoQr() {
  onQr(DEMO_SCAN.qr);
}

async function pasteQr() {
  const a = await alertController.create({
    header: 'Pegá el texto del QR',
    inputs: [{ name: 'qr', type: 'text', placeholder: 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?…' }],
    buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Leer', role: 'confirm' }],
  });
  await a.present();
  const { role, data } = await a.onDidDismiss<{ values: { qr: string } }>();
  if (role === 'confirm' && data?.values.qr.trim()) onQr(data.values.qr.trim());
}

function useDemoPaper() {
  carga.photo = { photo: '', demo: true };
  step.value = 'papel';
}

/** Ticket sin QR: foto con el escáner de documentos (Android) o la cámara (iPhone). */
async function shoot() {
  if (!native) {
    // En el navegador el selector se abre en el mismo toque
    const picked = await pickImageFile(true);
    if (picked) openPaper(picked);
    return;
  }
  busy.value = true;
  await stopScan();
  try {
    const shot = await takePaperPhoto();
    if (shot !== 'cancelled') return openPaper(shot);
  } catch (e) {
    console.warn('Foto', e);
  } finally {
    busy.value = false;
  }
  await startScan();
}

async function fromGallery() {
  const picked = await pickImageFile(false);
  if (picked) openPaper(picked);
}

function openPaper(p: { photo: string; path?: string }) {
  carga.photo = p;
  step.value = 'papel';
}

/** De vuelta a la cámara, para el próximo ticket. */
function toCamera(text?: string) {
  scanned.value = undefined;
  step.value = 'camara';
  if (text) flash(added, text);
}

watch(step, (s) => (s === 'camara' ? void startScan() : void stopScan()));
onMounted(() => void startScan());
onBeforeUnmount(() => {
  clearTimeout(timer);
  void stopScan();
});
</script>

<style scoped>
.camara-content { --background: #0b0b0c; }
.camara-content.live { --background: transparent; }
.camara {
  min-height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; overflow: hidden;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
  background: #0b0b0c; color: #fff; font-family: var(--rb-font);
}
/* Con la cámara en vivo, el fondo es transparente y lo oscuro lo pone la sombra del visor */
.camara.live { background: transparent; visibility: visible; }
.camara button { font: inherit; color: inherit; border: 0; cursor: pointer; }
.top, .hint, .bottom { position: relative; z-index: 1; }
.top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; height: 44px; }
.top .title { font-size: 16px; font-weight: 600; }
.round { width: 40px; height: 40px; border-radius: 50%; background: rgba(255, 255, 255, 0.14); display: flex; align-items: center; justify-content: center; }
.round.end { justify-self: end; }
.round.on { background: #fff; color: #0b0b0c; }
.viewport { position: relative; flex-grow: 1; min-height: 360px; border-radius: 22px; background: #2a2724; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.viewport.hole { background: transparent; overflow: visible; box-shadow: 0 0 0 100vmax #0b0b0c; }
.paper { width: 210px; height: 330px; border-radius: 6px; background: #ede9e2; padding: 18px 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 7px; transform: rotate(-3deg); }
.paper i { display: block; height: 5px; border-radius: 2px; background: #cfc9bf; }
.paper i.strong { height: 8px; background: #b8b2a8; }
.paper i.c { align-self: center; }
.paper i.r { align-self: flex-end; margin-top: 4px; }
.paper i.rule { height: 1px; margin: 6px 0; }
.w45 { width: 45%; } .w60 { width: 60%; } .w70 { width: 70%; } .w75 { width: 75%; } .w80 { width: 80%; } .w85 { width: 85%; } .w90 { width: 90%; }
.paper .qr {
  margin-top: auto; align-self: center; width: 84px; height: 84px; background-color: #fff;
  background-image: repeating-conic-gradient(#111 0 25%, #fff 0 50%); background-size: 24px 24px; background-position: 6px 6px; border: 6px solid #fff; box-sizing: border-box;
}
.demo { position: absolute; top: 14px; left: 14px; right: 14px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.demo-btn { height: 34px; padding: 0 12px; border-radius: 999px; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 13px; font-weight: 500; }
.message { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; font-size: 16px; line-height: 1.4; background: #1c1c1e; }
.added { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); max-width: calc(100% - 28px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 30px; padding: 0 12px; border-radius: 999px; background: #30d158; color: #0b0b0c; font-size: 13px; font-weight: 600; display: flex; align-items: center; }
.found { position: absolute; left: 14px; right: 14px; bottom: 14px; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: #fff; color: var(--rb-ink); }
.found.muted { background: rgba(255, 255, 255, 0.92); }
.found .ok { width: 36px; height: 36px; border-radius: 50%; background: var(--rb-accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.found .grow { flex-grow: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.found .t { font-size: 14px; font-weight: 600; }
.found .s { font-size: 13px; color: var(--rb-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.camara .use { height: 36px; padding: 0 14px; border-radius: 999px; background: var(--rb-accent); color: #fff; font-size: 14px; font-weight: 600; flex-shrink: 0; }
.hint { font-size: 16px; line-height: 1.5; color: #e5e5ea; text-align: center; }
.bottom { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
.gallery { width: 48px; height: 48px; border-radius: 12px; background: rgba(255, 255, 255, 0.14); display: flex; align-items: center; justify-content: center; }
.shutter { width: 72px; height: 72px; box-sizing: border-box; border-radius: 50%; border: 4px solid #fff !important; padding: 4px; background: transparent; }
.shutter span { display: block; width: 100%; height: 100%; border-radius: 50%; background: #fff; }
.camara button:disabled { opacity: 0.5; }
</style>
