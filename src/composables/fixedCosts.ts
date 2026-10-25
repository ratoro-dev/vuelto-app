import { computed } from 'vue';
import { billPaymentIds } from '@/domain/bills';
import { useFinanzasStore } from '@/stores/finanzas';
import { useGastosStore } from '@/stores/gastos';

/**
 * Los gastos que son el pago de una factura (gastos fijos): los anotados al marcarla pagada y los registrados
 * aparte que se reconocen como su pago. Se ven entre los gastos, marcados, pero no salen del presupuesto.
 */
export function useFixedCostIds() {
  const gastos = useGastosStore();
  const finanzas = useFinanzasStore();
  return computed(() => billPaymentIds(finanzas.bills, gastos.tickets, gastos.months));
}
