<template>
  <!-- Estados normales de un gasto: ícono gris y sin texto. Solo "para revisar" lleva color (y texto, afuera). -->
  <svg role="img" :aria-label="label" width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="state === 'revisar' ? 'var(--rb-warn)' : 'var(--rb-icon)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <template v-if="state === 'telefono'"><path d="M2 2l20 20M5.8 8.6A5 5 0 0 0 7 18h10M20.5 15.5A4 4 0 0 0 17 10h-1.3A7 7 0 0 0 9.3 5.2" /></template>
    <template v-else-if="state === 'subiendo'"><path d="M12 19V9M8 13l4-4 4 4M7 18a5 5 0 0 1-.6-9.96A7 7 0 0 1 20 10a4 4 0 0 1-1 7.9" /></template>
    <template v-else-if="state === 'sincronizado'"><path d="M7 18a5 5 0 0 1-.6-9.96A7 7 0 0 1 20 10a4 4 0 0 1-1 8H7z" /><path d="M9.5 13.5l2 2 3.5-3.5" /></template>
    <template v-else><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type SyncIconState = 'telefono' | 'subiendo' | 'sincronizado' | 'revisar';

const props = defineProps<{ state: SyncIconState }>();
const label = computed(
  () =>
    ({
      telefono: 'Guardado en el teléfono; se sube al volver la conexión',
      subiendo: 'Subiendo',
      sincronizado: 'Sincronizado',
      revisar: 'Requiere revisión',
    })[props.state],
);
</script>
