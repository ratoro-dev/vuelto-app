<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="PATHS[category]" />
  </svg>
</template>

<script setup lang="ts">
import type { Category } from '@/domain/types';

withDefaults(defineProps<{ category: Category; size?: number }>(), { size: 16 });

/** Un trazo por categoría, en el estilo de línea de la propuesta. */
const PATHS: Record<Category, string> = {
  Supermercado: 'M6 6h15l-2 9H8L6 3H3M9 20h.01M18 20h.01',
  'Delivery y salidas': 'M7 3.5v17M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M17 20.5v-17c-2.2 1.3-3.3 4-3.3 7.3v3.2H17',
  Transporte: 'M7 3h10a3 3 0 0 1 3 3v11H4V6a3 3 0 0 1 3-3zM4 11h16M8 21l1-4M16 21l-1-4',
  Servicios: 'M13 2.5L5 13.5h6l-1 8 8-11h-6z',
  Salud: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  Hogar: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  Otros: 'M4 7.5l8-4 8 4v9l-8 4-8-4zM4 7.5l8 4 8-4M12 11.5v9',
};
</script>
