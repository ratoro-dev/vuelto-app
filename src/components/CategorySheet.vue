<template>
  <ion-modal :is-open="open" :initial-breakpoint="1" :breakpoints="[0, 1]" class="sheet-modal" @did-dismiss="emit('close')">
    <div class="rb-sheet">
      <div class="head">
        <button v-if="step === 'sub'" type="button" class="icon-btn" aria-label="Volver a las categorías" @click="step = 'cat'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div class="titles">
          <div class="t">{{ step === 'cat' ? 'Categoría' : picked }}</div>
          <div v-if="subtitle || step === 'sub'" class="subtitle">{{ step === 'cat' ? subtitle : 'Elegí una subcategoría' }}</div>
        </div>
        <button type="button" class="icon-btn" aria-label="Cerrar" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div class="list">
        <template v-if="step === 'cat'">
          <button v-for="c in CATEGORIES" :key="c" type="button" class="item" :aria-pressed="c === category" @click="pickCategory(c)">
            <span class="rb-icon-circle"><category-icon :category="c" /></span>
            <span class="name">{{ c }}</span>
            <svg v-if="c === category" class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AEAEB2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </template>
        <template v-else>
          <button
            v-for="s in SUBCATEGORIES[picked]"
            :key="s"
            type="button"
            class="item"
            :aria-pressed="picked === category && s === subcategory"
            @click="emit('select', { category: picked, subcategory: s })"
          >
            <span class="name">{{ s }}</span>
            <svg v-if="picked === category && s === subcategory" class="check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
          </button>
        </template>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal } from '@ionic/vue';
import { ref, watch } from 'vue';
import CategoryIcon from '@/components/CategoryIcon.vue';
import { CATEGORIES, SUBCATEGORIES } from '@/domain/categories';
import type { Category } from '@/domain/types';

/**
 * Hoja inferior en dos pasos: categoría y después subcategoría.
 * Así la subcategoría nunca se pone sola (antes la leche terminaba en "Combustible").
 */
const props = defineProps<{ open: boolean; category: Category; subcategory?: string; subtitle?: string }>();
const emit = defineEmits<{ select: [value: { category: Category; subcategory: string }]; close: [] }>();

const step = ref<'cat' | 'sub'>('cat');
const picked = ref<Category>(props.category);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    step.value = 'cat';
    picked.value = props.category;
  },
);

function pickCategory(c: Category) {
  picked.value = c;
  step.value = 'sub';
}
</script>

<style scoped>
ion-modal.sheet-modal { --height: auto; --border-radius: 16px; --background: var(--rb-bg); }
.titles { flex-grow: 1; min-width: 0; }
.subtitle { font-size: 13px; color: var(--rb-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rb-sheet .icon-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--rb-segment); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.list { background: #fff; border-radius: 14px; padding: 0 14px; max-height: 60vh; overflow-y: auto; }
.rb-sheet .item { width: 100%; min-height: 50px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--rb-line); font-size: 15px; }
.rb-sheet .item:last-child { border-bottom: 0; }
.item .name { flex-grow: 1; }
.check { color: var(--rb-accent); }
</style>
