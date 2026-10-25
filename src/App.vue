<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { startNativeBridges } from '@/composables/nativeBridges';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';
import { useSyncStore } from '@/stores/sync';

const gastos = useGastosStore();
const finanzas = useFinanzasStore();
const sync = useSyncStore();
const router = useRouter();

onMounted(async () => {
  await Promise.all([gastos.init(), finanzas.init()]);
  startNativeBridges(router);
  await sync.start();
});
</script>
